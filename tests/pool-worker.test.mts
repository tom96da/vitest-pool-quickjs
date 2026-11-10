// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";

import { describe, expect, it } from "vitest";
import type { WorkerRequest } from "vitest/node";

import { quickjsPool } from "./fixture-config.mts";

const root = path.resolve(import.meta.dirname, "fixture-filter");

describe("a worker whose start throws", () => {
  it("rejects start, and a later send does nothing", async () => {
    const worker = quickjsPool({
      preludes: [path.resolve(import.meta.dirname, "throwing-prelude.js")],
    }).createPoolWorker({ project: { config: { root, fsModuleCache: false } } } as never);
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    await expect(worker.start()).rejects.toThrow("prelude failed");
    worker.send({ type: "stop" } as WorkerRequest);
    expect(errors).toEqual([]);
  });
});
