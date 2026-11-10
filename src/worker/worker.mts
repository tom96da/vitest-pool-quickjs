// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The vitest worker that runs inside the QuickJS context.

import "./prelude.mts";
import externals from "virtual:externals";
import * as vitest from "vitest";
import { init, runBaseTests, setupEnvironment } from "vitest/worker";

import { decode, encode } from "./codec.mts";

const handlers = new Set<(message: unknown) => unknown>();

// The pool calls this with each message that vitest sent.
globalThis.__onMessage = (text) => {
  const message = decode(text);
  for (const handler of handlers) {
    Promise.resolve(handler(message)).catch((e: unknown) =>
      __stderr(`${(e as Error)?.stack ?? String(e)}\n`),
    );
  }
};

init({
  post: (response) => __post(encode(response)),
  on: (handler) => void handlers.add(handler),
  off: (handler) => void handlers.delete(handler),
  runTests: (state, traces) => runBaseTests("run", state, traces),
  collectTests: (state, traces) => runBaseTests("collect", state, traces),
  setup: setupEnvironment,
});

// The module runner imports what the server externalized through this function.
globalThis.__externalImport = async (file) => {
  if (file === "vitest" || file.endsWith("/vitest/dist/index.js")) return vitest;
  const hit = externals[file] ?? externals[file.replace(/^file:\/\//, "")];
  if (hit) return hit;
  throw new Error(
    `cannot import "${file}" in the QuickJS context. ` +
      "list it in the externals option of quickjsPool",
  );
};
