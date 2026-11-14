// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

import { JSException, QuickJS } from "quickjs-wasi";
import type { HostFunction, JSValueHandle } from "quickjs-wasi";

import type { ContextSnapshot, Prepared, Report } from "./types.mts";

/** The memory limit of one context. */
const memoryLimit = 1024 * 1024 * 1024;

/** The native stack the engine may use. A larger size lets deep recursion overflow the host stack. */
const maxStackSize = 393216;

const port = parentPort!;
const { wasm, extensions, visible, worker, preludes, env, snapshot, takeSnapshot }: Prepared =
  workerData;

/**
 * Sends a report to the pool.
 * @param message - what the thread reports
 */
const report = (message: Report): void => {
  if (booting && (message.kind === "stdout" || message.kind === "stderr")) booting.push(message);
  port.postMessage(message);
};

/** What the scripts write while the context boots, kept for the snapshot. */
let booting: ContextSnapshot["output"] | undefined = takeSnapshot ? [] : undefined;

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
/** The object of the context with the functions that the thread calls. */
let entry!: JSValueHandle;
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
 * The host functions of the context by name. A snapshot stores the names, so a restored context
 * gets the same functions again by them.
 */
const functions: Record<string, HostFunction> = {};

/**
 * Defines a host function of string arguments.
 * @param name - the name of the function
 * @param fn - the host function; a string it returns is the result
 */
function define(name: string, fn: (...args: string[]) => string | void): void {
  functions[name] = (...args: JSValueHandle[]) => {
    const result = fn(...args.map((a) => a.toString()));
    return typeof result === "string" ? vm.newString(result) : vm.undefined;
  };
}

/**
 * Defines a host function of string arguments that returns a promise. The host work runs on the
 * event loop of the thread, and its result settles the promise and runs the jobs that wait on it.
 * @param name - the name of the function
 * @param fn - the host work, which resolves to the result as a string
 */
function defineAsync(name: string, fn: (...args: string[]) => Promise<string | void>): void {
  functions[name] = (...args: JSValueHandle[]) => {
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
  };
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
 * Calls a function of the context that the worker handed over, with string arguments.
 * @param name - the name of the function
 * @param args - the arguments, passed as strings
 * @returns the result when it is a number or a string, otherwise `undefined`
 */
function call(name: string, ...args: string[]): number | string | undefined {
  return guest(() => {
    const result = vm.callFunction(entry.getProp(name), entry, ...args.map((a) => vm.newString(a)));
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
    call("flushRejections");
    drain();
    while (call("fireTimers") === 1) {
      drain();
      call("flushRejections");
      drain();
    }
  } catch (error) {
    report({ kind: "error", value: error });
  }
  try {
    const delay = call("timerDelay");
    if (typeof delay === "number" && delay >= 0) timer = setTimeout(pump, delay);
  } catch (error) {
    report({ kind: "error", value: error });
  }
}

/**
 * Takes the object that the worker handed over in `__guest`, and removes it from the global so
 * that no script finds it.
 */
function takeEntry(): void {
  entry = vm.global.getProp("__guest");
  if (entry.isUndefined) throw new Error("the worker did not hand over its functions");
  run("delete globalThis.__guest;", "entry.js");
}

try {
  // the clock of a restored context goes on from where the snapshot was taken, so that a time
  // that a script noted while it loaded is never ahead of the time of a test
  const start = performance.now() - (snapshot?.clock ?? 0);
  const options = { wasm, extensions, memoryLimit, maxStackSize, onUnhandledRejection: track };
  vm = snapshot
    ? await QuickJS.restore({ ...snapshot, memory: new Uint8Array(snapshot.memory) }, options)
    : await QuickJS.create(options);
  define("stdout", (text) => report({ kind: "stdout", value: text }));
  define("stderr", (text) => report({ kind: "stderr", value: text }));
  define("post", (text) => report({ kind: "message", value: text }));
  define("gc", () => vm.runGC());
  functions.evalFile = (code, filename) => vm.evalCode(code.toString(), filename.toString());
  defineAsync("readFile", (file) =>
    readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      // a missing file reads as nothing
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }),
  );
  defineAsync("writeFile", async (file, text) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  });
  defineAsync("removeFile", (file) => rm(file, { force: true }));
  functions.now = () => vm.newNumber(performance.now() - start);
  if (snapshot) {
    // the functions of the restored context are found again by their names
    for (const [name, fn] of Object.entries(functions)) vm.registerHostCallback(name, fn);
    takeEntry();
    rejections = entry.getProp("rejections");
    for (const line of snapshot.output) report(line);
    // the time origin is the one of this thread
    run("performance.timeOrigin = Date.now() - performance.now();", "restore.js");
  } else {
    rejections = vm.newObject();
    const host = vm.newObject();
    for (const [name, fn] of Object.entries(functions)) {
      const handle = vm.newFunction(name, fn);
      vm.setProp(host, name, handle);
      handle.dispose();
    }
    vm.setProp(host, "rejections", rejections);
    vm.setProp(vm.global, "__host", host);
    host.dispose();
    run(
      `__host.env = ${JSON.stringify(env)}; __host.visible = ${JSON.stringify(visible)};`,
      "env.js",
    );
    for (const prelude of preludes) run(prelude.code, prelude.name);
    run(worker, "worker.js");
    takeEntry();
  }
  if (takeSnapshot) {
    drain();
    // the entry goes through the global while the snapshot is taken, because the handle of the
    // thread does not outlive it
    vm.setProp(vm.global, "__guest", entry);
    const taken = vm.snapshot();
    run("delete globalThis.__guest;", "entry.js");
    const memory = new SharedArrayBuffer(taken.memory.byteLength);
    new Uint8Array(memory).set(taken.memory);
    report({
      kind: "snapshot",
      value: { ...taken, memory, clock: performance.now() - start, output: booting! },
    });
    booting = undefined;
  }
  port.on("message", (text: string) => {
    try {
      call("onMessage", text);
    } catch (error) {
      report({ kind: "error", value: error });
    }
    pump();
  });
  report({ kind: "ready" });
} catch (error) {
  report({ kind: "failed", value: error });
}
