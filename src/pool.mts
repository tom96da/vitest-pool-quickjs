// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { newQuickJSWASMModule } from "quickjs-emscripten";
import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from "quickjs-emscripten";
import type { Plugin } from "rolldown";
import type { PoolOptions, PoolRunnerInitializer, PoolWorker, WorkerRequest } from "vitest/node";

import { buildWorker } from "./bundle.mts";
import { decode, encode } from "./worker/codec.mts";

/** Options of `quickjsPool()`. */
export interface QuickJSPoolOptions {
  /**
   * Modules that a test imports and that Vitest does not inline, such as a CommonJS file. A test
   * can import each listed specifier, for example `"@vue/runtime-core/dist/runtime-core.cjs.js"`.
   */
  externals?: string[];
  /** Paths of scripts to run in the context before the tests, for example to define globals. */
  preludes?: string[];
  /** Source of `node:*` modules by id. It wins over the modules that the pool provides. */
  modules?: Record<string, string>;
  /** Rolldown plugins that apply to the modules the pool loads into the context. */
  plugins?: Plugin[];
}

/** What a pool worker loads into a new context: the bundled worker and the scripts before it. */
interface Prepared {
  worker: string;
  preludes: { name: string; code: string }[];
}

/** The memory limit of one context. */
const memoryLimit = 1024 * 1024 * 1024;

/** The WebAssembly build of QuickJS. Every context of the process comes from this module. */
const wasm = newQuickJSWASMModule(variant);

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

class QuickJSPoolWorker extends EventEmitter implements PoolWorker {
  readonly name = "quickjs";
  private runtime?: QuickJSRuntime;
  private vm?: QuickJSContext;
  private timer?: NodeJS.Timeout;

  private prepare: () => Promise<Prepared>;
  constructor(prepare: () => Promise<Prepared>) {
    super();
    this.prepare = prepare;
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  async start(): Promise<void> {
    if (this.vm) return;
    const { worker, preludes } = await this.prepare();
    const start = performance.now();
    this.runtime = (await wasm).newRuntime();
    this.runtime.setMemoryLimit(memoryLimit);
    const vm = (this.vm = this.runtime.newContext());
    this.define("__stdout", (text) => void process.stdout.write(text));
    this.define("__stderr", (text) => void process.stderr.write(text));
    this.define("__post", (text) => queueMicrotask(() => this.emit("message", decode(text))));
    this.define("__evalFile", (code, filename) => {
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
    for (const prelude of preludes) this.run(prelude.code, prelude.name);
    this.run(worker, "worker.js");
  }

  send(message: WorkerRequest): void {
    if (!this.vm) return;
    try {
      this.call("__onMessage", encode(message));
    } catch (error) {
      this.emit("error", error);
    }
    this.pump();
  }

  async stop(): Promise<void> {
    clearTimeout(this.timer);
    // no dispose: the engine asserts at disposal after a collected cycle that held a weak
    // reference, and the abort ends the whole wasm module. The memory stays until the process
    // exits.
    this.vm = undefined;
    this.runtime = undefined;
  }

  /**
   * Defines a global function of string arguments in the context.
   * @param name - the name of the global
   * @param fn - the host function the global calls
   */
  private define(name: string, fn: (...args: string[]) => void): void {
    const vm = this.vm!;
    const handle = vm.newFunction(name, (...args: QuickJSHandle[]) => {
      fn(...args.map((a) => vm.getString(a)));
    });
    vm.setProp(vm.global, name, handle);
    handle.dispose();
  }

  /**
   * Runs a script in the context.
   * @param code - the source of the script
   * @param name - the file name that stack traces show
   */
  private run(code: string, name: string): void {
    const result = this.vm!.evalCode(code, name);
    if (result.error) {
      const error = this.vm!.dump(result.error);
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
  private call(name: string, ...args: string[]): number | string | undefined {
    const vm = this.vm!;
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
  private drain(): void {
    const runtime = this.runtime!;
    while (runtime.hasPendingJob()) {
      const result = runtime.executePendingJobs();
      if (result.error) {
        const error = this.vm!.dump(result.error);
        result.error.dispose();
        throw new Error(describe(error));
      }
    }
  }

  /**
   * Runs the pending jobs and the due timers, one timer at a time with the jobs of its promises
   * in between, then sleeps until the next timer. The sleep is set even when a step threw.
   */
  private pump(): void {
    clearTimeout(this.timer);
    if (!this.vm) return;
    try {
      this.drain();
      this.call("__flushRejections");
      this.drain();
      while (this.call("__fireTimers") === 1) {
        this.drain();
        this.call("__flushRejections");
        this.drain();
      }
    } catch (error) {
      this.emit("error", error);
    }
    try {
      const delay = this.call("__timerDelay");
      if (typeof delay === "number" && delay >= 0) {
        this.timer = setTimeout(() => this.pump(), delay);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }
}

/**
 * Creates the pool for the `test.pool` option of a Vitest config. Vitest reads the config, finds
 * the files, transforms them and prints the report in Node. Each test file runs in a QuickJS
 * context.
 * @param options - the modules and scripts that the tests need in the context
 * @returns the pool to assign to `test.pool`
 */
export function quickjsPool(options: QuickJSPoolOptions = {}): PoolRunnerInitializer {
  const builds = new Map<string, Promise<Prepared>>();
  const prepared = (root: string): Promise<Prepared> => {
    if (!builds.has(root)) {
      builds.set(
        root,
        (async () => ({
          worker: await buildWorker({
            root,
            externals: options.externals ?? [],
            modules: options.modules ?? {},
            plugins: options.plugins ?? [],
          }),
          preludes: await Promise.all(
            (options.preludes ?? []).map(async (file) => ({
              name: file,
              code: await readFile(file, "utf8"),
            })),
          ),
        }))(),
      );
    }
    return builds.get(root)!;
  };
  return {
    name: "quickjs",
    createPoolWorker: (poolOptions: PoolOptions) => {
      const { config } = poolOptions.project;
      // vitest 5.1 caches the transformed modules on the file system by default and then sends
      // the path of the file. The context has no file system to read it.
      if (config.fsModuleCache) {
        throw new Error(
          "the vitest option fsModuleCache is on. " +
            "set `fsModuleCache: false` in the test options of the config",
        );
      }
      return new QuickJSPoolWorker(() => prepared(config.root));
    },
  };
}
