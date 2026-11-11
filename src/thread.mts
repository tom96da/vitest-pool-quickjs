// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { parentPort, workerData } from "node:worker_threads";

import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { newQuickJSWASMModule } from "quickjs-emscripten";
import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten";

import type { Prepared, Report } from "./types.mts";

/** The memory limit of one context. */
const memoryLimit = 1024 * 1024 * 1024;

const port = parentPort!;
const { worker, preludes }: Prepared = workerData;

/**
 * Sends a report to the pool.
 * @param message - what the thread reports
 */
const report = (message: Report): void => port.postMessage(message);

/**
 * Formats a value that a QuickJS call threw.
 * @param error - the dumped value, an error object or any other thrown value
 * @returns the name, message and stack of an error, or the JSON of another value
 */
function describe(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as { name?: string; message?: string; stack?: string };
    return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
  }
  return `thrown: ${JSON.stringify(error)}`;
}

let runtime: QuickJSRuntime;
let vm: QuickJSContext;
let timer: NodeJS.Timeout | undefined;

/**
 * Defines a global function of string arguments in the context.
 * @param name - the name of the global
 * @param fn - the host function the global calls; a string it returns is the result
 */
function define(name: string, fn: (...args: string[]) => string | void): void {
  const handle = vm.newFunction(name, (...args: QuickJSHandle[]) => {
    const result = fn(...args.map((a) => vm.getString(a)));
    return typeof result === "string" ? vm.newString(result) : undefined;
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
  const result = vm.evalCode(code, name);
  if (result.error) {
    const error = vm.dump(result.error);
    result.error.dispose();
    throw new Error(describe(error));
  }
  result.value.dispose();
}

/**
 * Calls a global function of the context with string arguments.
 * @param name - the name of the global function
 * @param args - the arguments, passed as strings
 * @returns the result when it is a number or a string, otherwise `undefined`
 */
function call(name: string, ...args: string[]): number | string | undefined {
  const fn = vm.getProp(vm.global, name);
  const handles = args.map((a) => vm.newString(a));
  const result = vm.callFunction(fn, vm.undefined, ...handles);
  fn.dispose();
  for (const h of handles) h.dispose();
  if (result.error) {
    const error = vm.dump(result.error);
    result.error.dispose();
    throw new Error(describe(error));
  }
  const type = vm.typeof(result.value);
  const value = type === "number" || type === "string" ? vm.dump(result.value) : undefined;
  result.value.dispose();
  return value;
}

/** Runs the pending jobs of the runtime until none is left. */
function drain(): void {
  while (runtime.hasPendingJob()) {
    const result = runtime.executePendingJobs();
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(describe(error));
    }
  }
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
  runtime = (await newQuickJSWASMModule(variant)).newRuntime();
  runtime.setMemoryLimit(memoryLimit);
  vm = runtime.newContext();
  define("__stdout", (text) => report({ kind: "stdout", value: text }));
  define("__stderr", (text) => report({ kind: "stderr", value: text }));
  define("__utf8", (bytes) =>
    Buffer.from(bytes, "hex")
      .toString("utf8")
      .split("")
      .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
      .join(""),
  );
  define("__post", (text) => report({ kind: "message", value: text }));
  define("__evalFile", (code, filename) => {
    const result = vm.evalCode(code, filename);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(describe(error));
    }
    vm.setProp(vm.global, "__evalResult", result.value);
    result.value.dispose();
  });
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
