// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { parentPort, workerData } from "node:worker_threads";

import { JSException, QuickJS } from "quickjs-wasi";
import type { JSValueHandle } from "quickjs-wasi";

import type { Prepared, Report } from "./types.mts";

/** The memory limit of one context. */
const memoryLimit = 1024 * 1024 * 1024;

/** The native stack the engine may use. A larger size lets deep recursion overflow the host stack. */
const maxStackSize = 393216;

const port = parentPort!;
const { wasm, worker, preludes }: Prepared = workerData;

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
  vm = await QuickJS.create({ wasm, memoryLimit, maxStackSize, onUnhandledRejection: track });
  rejections = vm.newObject();
  vm.setProp(vm.global, "__rejections", rejections);
  define("__stdout", (text) => report({ kind: "stdout", value: text }));
  define("__stderr", (text) => report({ kind: "stderr", value: text }));
  define("__post", (text) => report({ kind: "message", value: text }));
  define("__evalFile", (code, filename) => {
    vm.setProp(vm.global, "__evalResult", vm.evalCode(code, filename));
  });
  const utf8 = vm.newFunction("__utf8", (bytes) =>
    vm.newString(Buffer.from(bytes.toArrayBuffer()).toString("utf8")),
  );
  vm.setProp(vm.global, "__utf8", utf8);
  utf8.dispose();
  const now = vm.newFunction("__now", () => vm.newNumber(performance.now() - start));
  vm.setProp(vm.global, "__now", now);
  now.dispose();
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
