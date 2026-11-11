// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import type { EventEmitter } from "node:events";
import path from "node:path";
import type { Worker } from "node:worker_threads";

import { describe, expect, it, vi } from "vitest";
import type { WorkerRequest } from "vitest/node";

import { encode } from "../src/worker/codec.mts";
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
    await vi.waitFor(() => expect(errors).toHaveLength(1));
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

describe("a worker that ends", () => {
  const make = () =>
    quickjsPool().createPoolWorker({
      project: { config: { root, fsModuleCache: false } },
    } as never) as unknown as EventEmitter & {
      thread?: Worker;
      start(): Promise<void>;
      stop(): Promise<void>;
    };

  it("rejects a start that is stopped while the thread boots", async () => {
    const worker = make();
    const start = worker.start().catch((error: unknown) => error);
    await vi.waitFor(() => expect(worker.thread).toBeDefined());
    await worker.stop();
    expect(await start).toMatchObject({
      message: "the thread of the worker ended before it was ready",
    });
  });

  it("rejects a start that is stopped while it prepares", async () => {
    const worker = make();
    const start = worker.start().catch((error: unknown) => error);
    await worker.stop();
    expect(await start).toMatchObject({ message: expect.stringContaining("stopped before it") });
    expect(worker.thread).toBeUndefined();
  });

  it("emits an error when the thread exits without a stop", async () => {
    const worker = make();
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    await worker.start();
    void worker.thread!.terminate();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors).toMatchObject([{ message: "the thread of the worker ended" }]);
    await worker.stop();
  });

  it("emits no error for a stop", async () => {
    const worker = make();
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    await worker.start();
    await worker.stop();
    expect(errors).toEqual([]);
  });
});

describe("stop", () => {
  it("is safe on a worker that was never started", async () => {
    const worker = quickjsPool().createPoolWorker({
      project: { config: { root, fsModuleCache: false } },
    } as never);
    await expect(worker.stop()).resolves.toBeUndefined();
  });

  it("is safe to call twice", async () => {
    const { worker } = await started();
    await worker.stop();
    await expect(worker.stop()).resolves.toBeUndefined();
  });
});

describe("the reports of a stopped thread", () => {
  it.each([
    { kind: "stdout", value: "late" },
    { kind: "stderr", value: "late" },
    { kind: "message", value: encode({ type: "late" }) },
    { kind: "error", value: new Error("late") },
  ])("reach nothing outside for the $kind report", async (report) => {
    const { worker, errors } = await started();
    const thread = (worker as unknown as { thread: Worker }).thread;
    const messages: unknown[] = [];
    worker.on("message", (message: unknown) => messages.push(message));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      // the thread drops its listeners when it exits, so the report comes while it ends
      const stopping = worker.stop();
      thread.emit("message", report);
      await stopping;
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(messages).toEqual([]);
    expect(errors).toEqual([]);
  });
});
