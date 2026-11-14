// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import type { Snapshot } from "quickjs-wasi";
import type { Plugin } from "rolldown";

import type { Extension } from "./extensions.mts";

/** Options of `quickjsPool()`. */
export interface QuickJSPoolOptions {
  /**
   * Specifiers of the modules that a test can import beyond the ones Vitest inlines, such as a
   * package from `node_modules` or a relative file.
   */
  externals?: string[];
  /**
   * Paths of scripts to run in the context before the tests, for example to define globals. A
   * relative path starts at the root of the project.
   */
  preludes?: string[];
  /** Source of `node:*` modules by id. It wins over the modules that the pool provides. */
  modules?: Record<string, string>;
  /** Rolldown plugins that apply to the modules the pool loads into the context. */
  plugins?: Plugin[];
  /**
   * Extensions of quickjs-wasi whose globals the tests can use, such as `url` for `URL`. The pool
   * loads `url` and `encoding` for vitest in any case, and the tests see what they define only
   * when they are listed here.
   */
  extensions?: Extension[];
  /**
   * Whether the pool saves the context of the first test file as a snapshot right after its setup,
   * and starts the other test files from that snapshot. Their setup is skipped, so each file starts
   * sooner.
   *
   * The setup loads Vitest, the scripts of `preludes` and the packages of `externals`. With the
   * snapshot, a value that they make while they load, such as a random id or the time, is the same
   * in every test file, and so is the sequence of `Math.random()`. Set `false` to run the setup for
   * each test file.
   *
   * @default true
   */
  snapshot?: boolean;
}

/**
 * A context after the preludes and the worker bundle ran. A thread that restores it skips them. Its
 * memory is shared with the threads, which copy it.
 */
export type ContextSnapshot = Omit<Snapshot, "memory"> & {
  memory: SharedArrayBuffer;
  /** The milliseconds on the clock of the context when the snapshot was taken. */
  clock: number;
  /** What the scripts wrote to the output while they loaded, which every restored thread repeats. */
  output: Extract<Report, { kind: "stdout" | "stderr" }>[];
};

/** What a pool worker loads into a new context: the engine, the bundled worker and the scripts before it. */
export interface Prepared {
  wasm: WebAssembly.Module;
  /** The extensions of the engine to load into the context. */
  extensions: { name: string; wasm: WebAssembly.Module }[];
  /** The extensions that the option lists. Their globals stay visible to the tests. */
  visible: string[];
  worker: string;
  preludes: { name: string; code: string }[];
  /** The environment variables that vitest resolves for the worker. */
  env: Record<string, string>;
  /** The context to restore, when there is one. */
  snapshot?: ContextSnapshot;
  /** The thread reports a snapshot of its context after it booted. */
  takeSnapshot?: boolean;
}

/** What a pool thread reports to the main thread. */
export type Report =
  | { kind: "ready" }
  | { kind: "failed"; value: unknown }
  | { kind: "error"; value: unknown }
  | { kind: "message"; value: string }
  | { kind: "stdout"; value: string }
  | { kind: "stderr"; value: string }
  | { kind: "snapshot"; value: ContextSnapshot };
