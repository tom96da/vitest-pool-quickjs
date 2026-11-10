// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";

import { describe, expect, it } from "vitest";
import type { WorkerRequest } from "vitest/node";

import { quickjsPool } from "./fixture-config.mts";

const root = path.resolve(import.meta.dirname, "fixture-filter");

/**
 * Starts a worker of the pool and collects its errors.
 * @returns the worker and the errors it emitted
 */
async function started() {
  const worker = quickjsPool().createPoolWorker({
    project: { config: { root, fsModuleCache: false } },
  } as never);
  const errors: unknown[] = [];
  worker.on("error", (error: unknown) => errors.push(error));
  await worker.start();
  return { worker, errors };
}

describe("the error event of a worker", () => {
  it("carries the error of a message that cannot be sent", async () => {
    const { worker, errors } = await started();
    const message = {
      get type(): string {
        throw new Error("cannot encode");
      },
    } as unknown as WorkerRequest;
    worker.send(message);
    expect(errors).toEqual([new Error("cannot encode")]);
    await worker.stop();
  });

  it("is not emitted for a message that is sent", async () => {
    const { worker, errors } = await started();
    worker.send({ type: "stop" } as WorkerRequest);
    expect(errors).toEqual([]);
    await worker.stop();
  });

  it("ignores a message sent after stop", async () => {
    const { worker, errors } = await started();
    await worker.stop();
    const message = {
      get type(): string {
        throw new Error("never read");
      },
    } as unknown as WorkerRequest;
    worker.send(message);
    expect(errors).toEqual([]);
  });
});

describe("the error event of a pump", () => {
  it("carries the error of the timer delay", async () => {
    const worker = quickjsPool({
      preludes: [path.resolve(import.meta.dirname, "delay-throwing-prelude.js")],
    }).createPoolWorker({ project: { config: { root, fsModuleCache: false } } } as never);
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    await worker.start();
    worker.send({ type: "stop" } as WorkerRequest);
    expect(errors).toMatchObject([{ message: expect.stringContaining("delay failed") }]);
    await worker.stop();
  });
});

describe("a worker whose start throws", () => {
  it("leaves a worker whose start threw inert", async () => {
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
