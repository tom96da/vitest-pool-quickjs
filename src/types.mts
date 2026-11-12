// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

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
  /** Extensions of quickjs-wasi to load into the context. Each one defines globals of the web. */
  extensions?: Extension[];
}

/** What a pool worker loads into a new context: the engine, the bundled worker and the scripts before it. */
export interface Prepared {
  wasm: WebAssembly.Module;
  /** The extensions of the engine to load into the context. */
  extensions: { name: string; wasm: WebAssembly.Module }[];
  worker: string;
  preludes: { name: string; code: string }[];
}

/** What a pool thread reports to the main thread. */
export type Report =
  | { kind: "ready" }
  | { kind: "failed"; value: unknown }
  | { kind: "error"; value: unknown }
  | { kind: "message"; value: string }
  | { kind: "stdout"; value: string }
  | { kind: "stderr"; value: string };
