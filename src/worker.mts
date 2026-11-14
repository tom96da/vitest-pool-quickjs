// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The vitest worker that runs inside the QuickJS context.

import externals from "virtual:externals";
import * as vitest from "vitest";
import { init, runBaseTests, setupEnvironment } from "vitest/worker";

import { decode, encode } from "./worker/codec.mts";
import { guest, host } from "./worker/host.mts";
import "./worker/prelude.mts";
import { SnapshotEnvironment } from "./worker/snapshots.mts";

const handlers = new Set<(message: unknown) => unknown>();

// The pool calls this with each message that vitest sent.
guest.onMessage = (text) => {
  const message = decode(text);
  for (const handler of handlers) {
    Promise.resolve(handler(message)).catch((e: unknown) =>
      host.stderr(`${(e as Error)?.stack ?? String(e)}\n`),
    );
  }
};

init({
  post: (response) => host.post(encode(response)),
  on: (handler) => void handlers.add(handler),
  off: (handler) => void handlers.delete(handler),
  runTests: (state, traces) => {
    // the environment of a config wins, because vitest resolves its own only when none is set
    if (!state.config.snapshotEnvironment)
      state.config.snapshotOptions.snapshotEnvironment = new SnapshotEnvironment(
        state.ctx.files.map((f) => f.filepath),
      );
    return runBaseTests("run", state, traces);
  },
  collectTests: (state, traces) => runBaseTests("collect", state, traces),
  setup: setupEnvironment,
});

// The module runner imports what the server externalized through this function.
guest.externalImport = async (file) => {
  if (file === "vitest" || file.endsWith("/vitest/dist/index.js")) return vitest;
  const hit = externals[file] ?? externals[file.replace(/^file:\/\//, "")];
  if (hit) return hit;
  throw new Error(
    `cannot import "${file}" in the QuickJS context. ` +
      "list it in the externals option of quickjsPool",
  );
};

// the thread takes the guest from the global at once
globalThis.__guest = guest;
