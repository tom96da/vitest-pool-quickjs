// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import type { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

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
    env: {},
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
    }).createPoolWorker({
      project: { config: { root, fsModuleCache: false } },
      env: {},
    } as never);
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
  it("stays inert after a start that threw", async () => {
    const worker = quickjsPool({
      preludes: [path.resolve(import.meta.dirname, "throwing-prelude.js")],
    }).createPoolWorker({
      project: { config: { root, fsModuleCache: false } },
      env: {},
    } as never);
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    await expect(worker.start()).rejects.toThrow("prelude failed");
    const postMessage = vi.spyOn(Worker.prototype, "postMessage");
    try {
      worker.send({ type: "stop" } as WorkerRequest);
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      postMessage.mockRestore();
    }
    expect(errors).toEqual([]);
  });
});

describe("a worker that ends", () => {
  const make = () =>
    quickjsPool().createPoolWorker({
      project: { config: { root, fsModuleCache: false } },
      env: {},
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
      env: {},
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

describe("the error event of a started thread", () => {
  const fail = async () => {
    const { worker, errors } = await started();
    const error = new Error("boom");
    const thread = (worker as unknown as { thread: Worker }).thread;
    thread.emit("error", error);
    return { worker, errors, error, thread };
  };

  it("reaches the error event of the worker once", async () => {
    const { worker, errors, error } = await fail();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(error);
    await worker.stop();
  });

  it("terminates the thread", async () => {
    const { worker, errors } = await started();
    const thread = (worker as unknown as { thread: Worker }).thread;
    const terminate = vi.spyOn(thread, "terminate");
    thread.emit("error", new Error("boom"));
    expect(terminate).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
    await worker.stop();
  });

  it("leaves the worker inert", async () => {
    const { worker, thread } = await fail();
    const postMessage = vi.spyOn(thread, "postMessage");
    worker.send({ type: "stop" } as WorkerRequest);
    expect(postMessage).not.toHaveBeenCalled();
    await worker.stop();
  });
});

describe("a worker that starts again after its prelude changed", () => {
  it("runs the prelude as it is now", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "prelude-")), "prelude.js");
    const pool = quickjsPool({ preludes: [file] });
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const written: string[] = [];
      for (const version of ["first", "second"]) {
        await writeFile(file, `__stdout("prelude ${version}\\n");`);
        const worker = pool.createPoolWorker({
          project: { config: { root, fsModuleCache: false } },
          env: {},
        } as never);
        await worker.start();
        await worker.stop();
        written.push(...stdout.mock.calls.map(([text]) => String(text)));
        stdout.mockClear();
      }
      expect(written).toEqual(["prelude first\n", "prelude second\n"]);
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("the snapshot option", () => {
  /**
   * Starts two workers of one pool whose prelude writes the time, and reads what each one wrote.
   * @param snapshot - the option of the pool
   * @returns the text that the prelude wrote for the first and for the second worker
   */
  async function twoStarts(snapshot: boolean | undefined) {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "prelude-")), "prelude.js");
    await writeFile(file, '__stdout("at " + Date.now() + "\\n");');
    const pool = quickjsPool({ preludes: [file], snapshot });
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const written: string[] = [];
      for (let i = 0; i < 2; i++) {
        const worker = pool.createPoolWorker({
          project: { config: { root, fsModuleCache: false } },
          env: {},
        } as never);
        await worker.start();
        await worker.stop();
        written.push(stdout.mock.calls.map(([text]) => String(text)).join(""));
        stdout.mockClear();
        // a moment that the clock can tell from the first
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return written;
    } finally {
      stdout.mockRestore();
    }
  }

  it("repeats the output of the first start by default", async () => {
    const [first, second] = await twoStarts(undefined);
    expect(first).toMatch(/^at \d+\n$/);
    expect(second).toBe(first);
  });

  it("runs the scripts again for each start when it is false", async () => {
    const [first, second] = await twoStarts(false);
    expect(second).toMatch(/^at \d+\n$/);
    expect(second).not.toBe(first);
  });
});

describe("the snapshot after a start that ended early", () => {
  /**
   * Starts and stops a worker of the pool.
   * @param pool - the pool
   * @param env - the environment that vitest gives the worker
   * @returns what the prelude wrote
   */
  async function once(pool: ReturnType<typeof quickjsPool>, env: Record<string, string> = {}) {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const worker = pool.createPoolWorker({
        project: { config: { root, fsModuleCache: false } },
        env,
      } as never);
      await worker.start();
      await worker.stop();
      return stdout.mock.calls.map(([text]) => String(text)).join("");
    } finally {
      stdout.mockRestore();
    }
  }

  /**
   * Writes a prelude that reports the time and the variable A of its environment.
   * @returns the path of the prelude
   */
  async function prelude() {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "prelude-")), "prelude.js");
    await writeFile(file, '__stdout("at " + Date.now() + " A=" + __env.A + "\\n");');
    return file;
  }

  it.each(["boots", "prepares"])(
    "is taken by the next start after one stopped while it %s",
    async (when) => {
      const pool = quickjsPool({ preludes: [await prelude()] });
      const first = pool.createPoolWorker({
        project: { config: { root, fsModuleCache: false } },
        env: {},
      } as never) as unknown as { thread?: Worker; start(): Promise<void>; stop(): Promise<void> };
      const start = first.start().catch(() => {});
      if (when === "boots") {
        await vi.waitFor(() => {
          if (!first.thread) throw new Error("the worker has not started its thread");
        });
      }
      await first.stop();
      await start;
      const second = await once(pool);
      // a moment that the clock can tell from the second start
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await once(pool)).toBe(second);
    },
  );

  it("keeps one snapshot for each environment", async () => {
    const pool = quickjsPool({ preludes: [await prelude()] });
    const [first, other] = [await once(pool, { A: "1" }), await once(pool, { A: "2" })];
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first).toMatch(/ A=1\n$/);
    expect(other).toMatch(/ A=2\n$/);
    expect(await once(pool, { A: "1" })).toBe(first);
  });

  it("refuses a snapshot option that is not a boolean", () => {
    expect(() => quickjsPool({ snapshot: "false" as never })).toThrow(
      'the snapshot option takes true or false, not "false"',
    );
  });
});
