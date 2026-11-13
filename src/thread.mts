// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

import { JSException, QuickJS } from "quickjs-wasi";
import type { JSValueHandle } from "quickjs-wasi";

import type { Prepared, Report } from "./types.mts";

/** The memory limit of one context. */
const memoryLimit = 1024 * 1024 * 1024;

/** The native stack the engine may use. A larger size lets deep recursion overflow the host stack. */
const maxStackSize = 393216;

const port = parentPort!;
const { wasm, extensions, worker, preludes, env }: Prepared = workerData;

/**
 * Sends a report to the pool.
 * @param message - what the thread reports
 */
const report = (message: Report): void => port.postMessage(message);

/**
 * Runs a call into the context and turns the exception of the context into an error that
 * carries its name, message and stack.
 * @param fn - the call
 * @returns what the call returns
 */
function guest<T>(fn: () => T): T {
  try {
    return vm.withScope(fn);
  } catch (error) {
    if (!(error instanceof JSException)) throw error;
    const { name, message, stack } = error;
    error.dispose();
    throw new Error(`${name}: ${message}${stack ? `\n${stack}` : ""}`);
  }
}

let vm: QuickJS;
/** Where the context finds the rejections that nothing handles. */
let rejections: JSValueHandle;
let timer: NodeJS.Timeout | undefined;

/**
 * Records a promise that rejects without a handler, or removes it when a handler arrives. The
 * entry lives in the context, because the handles of the engine end with the call.
 * @param promise - the rejected promise
 * @param reason - why it rejected
 * @param handled - whether a handler was just attached
 */
function track(promise: JSValueHandle, reason: JSValueHandle, handled: boolean): void {
  vm.withScope(() => {
    // a key of digits only would sort by number, not by the order of the rejections
    const key = `promise-${promise.identity}`;
    if (handled) return vm.setProp(rejections, key, vm.undefined);
    const entry = vm.newObject();
    vm.setProp(entry, "promise", promise);
    vm.setProp(entry, "reason", reason);
    vm.setProp(rejections, key, entry);
  });
}

/**
 * Defines a global function of string arguments in the context.
 * @param name - the name of the global
 * @param fn - the host function the global calls; a string it returns is the result
 */
function define(name: string, fn: (...args: string[]) => string | void): void {
  const handle = vm.newFunction(name, (...args: JSValueHandle[]) => {
    const result = fn(...args.map((a) => a.toString()));
    return typeof result === "string" ? vm.newString(result) : vm.undefined;
  });
  vm.setProp(vm.global, name, handle);
  handle.dispose();
}

/**
 * Defines a global function of string arguments in the context that returns a promise. The host
 * work runs on the event loop of the thread, and its result settles the promise and runs the jobs
 * that wait on it.
 * @param name - the name of the global
 * @param fn - the host work, which resolves to the result as a string
 */
function defineAsync(name: string, fn: (...args: string[]) => Promise<string | void>): void {
  const handle = vm.newFunction(name, (...args: JSValueHandle[]) => {
    const deferred = vm.newPromise();
    fn(...args.map((a) => a.toString()))
      .then(
        (result) =>
          vm.withScope(() =>
            deferred.resolve(typeof result === "string" ? vm.newString(result) : vm.undefined),
          ),
        (error: Error) => vm.withScope(() => deferred.reject(vm.newError(error))),
      )
      .then(pump, (error) => report({ kind: "error", value: error }));
    return deferred.handle;
  });
  vm.setProp(vm.global, name, handle);
  handle.dispose();
}

/**
 * Runs a script in the context.
 * @param code - the source of the script
 * @param name - the file name that stack traces show
 */
function run(code: string, name: string): void {
  guest(() => vm.evalCode(code, name));
}

/**
 * Calls a global function of the context with string arguments.
 * @param name - the name of the global function
 * @param args - the arguments, passed as strings
 * @returns the result when it is a number or a string, otherwise `undefined`
 */
function call(name: string, ...args: string[]): number | string | undefined {
  return guest(() => {
    const result = vm.callFunction(
      vm.global.getProp(name),
      vm.undefined,
      ...args.map((a) => vm.newString(a)),
    );
    return result.isNumber ? result.toNumber() : result.isString ? result.toString() : undefined;
  });
}

/** Runs the pending jobs of the runtime until none is left. */
function drain(): void {
  guest(() => {
    while (vm.executePendingJobs() > 0);
  });
}

/**
 * Runs the pending jobs and the due timers, one timer at a time with the jobs of its promises
 * in between, then sleeps until the next timer. The sleep is set even when a step threw.
 */
function pump(): void {
  clearTimeout(timer);
  try {
    drain();
    call("__flushRejections");
    drain();
    while (call("__fireTimers") === 1) {
      drain();
      call("__flushRejections");
      drain();
    }
  } catch (error) {
    report({ kind: "error", value: error });
  }
  try {
    const delay = call("__timerDelay");
    if (typeof delay === "number" && delay >= 0) timer = setTimeout(pump, delay);
  } catch (error) {
    report({ kind: "error", value: error });
  }
}

try {
  const start = performance.now();
  vm = await QuickJS.create({
    wasm,
    extensions,
    memoryLimit,
    maxStackSize,
    onUnhandledRejection: track,
  });
  rejections = vm.newObject();
  vm.setProp(vm.global, "__rejections", rejections);
  define("__stdout", (text) => report({ kind: "stdout", value: text }));
  define("__stderr", (text) => report({ kind: "stderr", value: text }));
  define("__post", (text) => report({ kind: "message", value: text }));
  define("__gc", () => vm.runGC());
  define("__evalFile", (code, filename) => {
    vm.setProp(vm.global, "__evalResult", vm.evalCode(code, filename));
  });
  defineAsync("__readFile", (file) =>
    readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      // a missing file reads as nothing
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }),
  );
  defineAsync("__writeFile", async (file, text) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  });
  defineAsync("__removeFile", (file) => rm(file, { force: true }));
  const now = vm.newFunction("__now", () => vm.newNumber(performance.now() - start));
  vm.setProp(vm.global, "__now", now);
  now.dispose();
  // the prelude of the pool takes it into `process.env`
  run(`globalThis.__env = ${JSON.stringify(env)};`, "env.js");
  for (const prelude of preludes) run(prelude.code, prelude.name);
  run(worker, "worker.js");
  port.on("message", (text: string) => {
    try {
      call("__onMessage", text);
    } catch (error) {
      report({ kind: "error", value: error });
    }
    pump();
  });
  report({ kind: "ready" });
} catch (error) {
  report({ kind: "failed", value: error });
}
