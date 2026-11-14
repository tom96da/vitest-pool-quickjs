// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import type { PoolOptions, PoolRunnerInitializer, PoolWorker, WorkerRequest } from "vitest/node";

import { asset, buildWorker } from "./bundle.mts";
import { internalExtensions, knownExtensions } from "./extensions.mts";
import type { ContextSnapshot, Prepared, QuickJSPoolOptions, Report } from "./types.mts";
import { decode, encode } from "./worker/codec.mts";

/** The thread that hosts one context. */
const threadUrl = asset("thread");

/** The modules of quickjs-wasi, compiled once and shared with every thread. */
const compiled = new Map<string, Promise<WebAssembly.Module>>();
const compile = (specifier: string): Promise<WebAssembly.Module> => {
  if (!compiled.has(specifier)) {
    compiled.set(
      specifier,
      readFile(fileURLToPath(import.meta.resolve(specifier))).then((bytes) =>
        WebAssembly.compile(bytes),
      ),
    );
  }
  return compiled.get(specifier)!;
};

/** What a worker starts from, and what to do with the snapshot of its context. */
interface Preparation {
  prepared: Prepared;
  /** Called with the snapshot of the context, or with `undefined` when the thread ended before it took one. */
  onSnapshot?: (snapshot: ContextSnapshot | undefined) => void;
}

class QuickJSPoolWorker extends EventEmitter implements PoolWorker {
  readonly name = "quickjs";
  private thread?: Worker;
  private stopped = false;

  private prepare: () => Promise<Preparation>;
  constructor(prepare: () => Promise<Preparation>) {
    super();
    this.prepare = prepare;
  }

  deserialize(data: unknown): unknown {
    return data;
  }

  async start(): Promise<void> {
    if (this.thread) return;
    const { prepared, onSnapshot } = await this.prepare();
    if (this.stopped) {
      onSnapshot?.(undefined);
      throw new Error("the worker was stopped before it started");
    }
    let thread: Worker;
    try {
      thread = this.thread = new Worker(threadUrl, { workerData: prepared });
    } catch (error) {
      onSnapshot?.(undefined);
      throw error;
    }
    let started = false;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => {
        // a failed start leaves the worker inert, so that a later send() does nothing
        this.thread = undefined;
        onSnapshot?.(undefined);
        void thread.terminate();
        reject(error);
      };
      thread.on("message", (report: Report) => {
        if (started && this.thread !== thread) return;
        if (report.kind === "ready") {
          started = true;
          resolve();
        } else if (report.kind === "failed") fail(report.value);
        else if (report.kind === "message") this.emit("message", decode(report.value));
        else if (report.kind === "stdout") process.stdout.write(report.value);
        else if (report.kind === "stderr") process.stderr.write(report.value);
        else if (report.kind === "error") this.emit("error", report.value);
        else if (report.kind === "snapshot") onSnapshot?.(report.value);
        else report satisfies never;
      });
      thread.on("error", (error) => {
        if (started && this.thread === thread) this.emit("error", error);
        fail(error);
      });
      thread.on("exit", () => {
        if (!started) fail(new Error("the thread of the worker ended before it was ready"));
        else if (this.thread === thread) {
          this.thread = undefined;
          this.emit("error", new Error("the thread of the worker ended"));
        }
      });
    });
  }

  send(message: WorkerRequest): void {
    if (!this.thread) return;
    try {
      this.thread.postMessage(encode(message));
    } catch (error) {
      this.emit("error", error);
    }
  }

  async stop(): Promise<void> {
    const thread = this.thread;
    this.stopped = true;
    this.thread = undefined;
    // the thread owns the runtime and ends with it, which skips the disposal that aborts the
    // wasm module after a collected cycle that held a weak reference
    await thread?.terminate();
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
  for (const name of options.extensions ?? []) {
    if (!knownExtensions.includes(name)) {
      throw new Error(
        `unknown extension "${name}" in the extensions option. ` +
          `it accepts ${knownExtensions.join(", ")}`,
      );
    }
  }
  if (options.snapshot !== undefined && typeof options.snapshot !== "boolean") {
    throw new Error(
      `the snapshot option takes true or false, not ${JSON.stringify(options.snapshot)}`,
    );
  }
  // vitest decodes UTF-8 and makes URLs with these extensions, whose globals stay hidden unless listed
  const visible = [...new Set(options.extensions ?? [])];
  const extensions = [...new Set([...Object.keys(internalExtensions), ...visible])];
  // the build is the slow part, so it is kept for the root; the scripts are read at every start
  const builds = new Map<string, Promise<string>>();
  // a snapshot is kept for each root and environment while the preludes stay the same, so that the
  // memory does not grow with every edit of a prelude
  const snapshots = new Map<
    string,
    { preludes: string; taking: boolean; snapshot?: ContextSnapshot }
  >();
  const prepare = async (
    root: string,
    env: Record<string, string | undefined>,
  ): Promise<Preparation> => {
    if (!builds.has(root)) {
      builds.set(root, buildWorker(root, options));
    }
    const base: Prepared = {
      wasm: await compile("quickjs-wasi/quickjs.wasm"),
      extensions: await Promise.all(
        extensions.map(async (name) => ({ name, wasm: await compile(`quickjs-wasi/${name}.so`) })),
      ),
      visible,
      worker: await builds.get(root)!,
      env: Object.fromEntries(
        Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ),
      preludes: await Promise.all(
        (options.preludes ?? []).map(async (file) => ({
          name: file,
          code: await readFile(path.resolve(root, file), "utf8"),
        })),
      ),
    };
    if (options.snapshot === false) return { prepared: base };
    const slot = JSON.stringify([root, base.env]);
    const preludes = JSON.stringify(base.preludes);
    let entry = snapshots.get(slot);
    if (entry?.preludes !== preludes) snapshots.set(slot, (entry = { preludes, taking: false }));
    if (entry.snapshot) return { prepared: { ...base, snapshot: entry.snapshot } };
    if (entry.taking) return { prepared: base };
    entry.taking = true;
    const claimed = entry;
    return {
      prepared: { ...base, takeSnapshot: true },
      onSnapshot: (snapshot) => {
        if (snapshot) claimed.snapshot = snapshot;
        else if (!claimed.snapshot) claimed.taking = false;
      },
    };
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
      return new QuickJSPoolWorker(() => prepare(config.root, poolOptions.env));
    },
  };
}
