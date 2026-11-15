// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { WorkerRequest } from "vitest/node";

import { buildWorker } from "../bundle.mts";
import { quickjsPool } from "../index.mts";
import type { ContextSnapshot } from "../types.mts";
import { nextThread } from "./pool.fake-worker.mts";
import { booting, createWorker, root, sleep, started, tempDir } from "./pool.helpers.mts";

// the factories come from a dynamic import, which runs when the module is mocked
vi.mock("node:worker_threads", async (importOriginal) =>
  (await import("./pool.mocks.mts")).workerThreadsFactory(importOriginal),
);
vi.mock("../bundle.mts", async (importOriginal) =>
  (await import("./pool.mocks.mts")).bundleFactory(importOriginal),
);

afterEach(() => {
  vi.mocked(buildWorker).mockClear();
});

// The messages of a build that fails, such as a missing config file, a config that throws and a
// second format, are covered by the tests of the bundle. Here the build only rejects.
describe("a worker whose build failed", () => {
  it("rejects the start when the config file is missing", async () => {
    vi.mocked(buildWorker).mockRejectedValueOnce(new Error("config file not found"));
    const unhandled = vi.fn<() => void>();
    process.on("unhandledRejection", unhandled);
    onTestFinished(() => void process.off("unhandledRejection", unhandled));
    await expect(createWorker().start()).rejects.toThrow("config file not found");
    // an unhandled rejection is reported on a later tick
    await sleep(50);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("builds again at the next start", async () => {
    vi.mocked(buildWorker).mockRejectedValueOnce(new Error("could not load the config file"));
    const pool = quickjsPool();
    await expect(createWorker(pool).start()).rejects.toThrow("could not load the config file");
    const { worker, thread, start } = await booting(pool);
    thread.report({ kind: "ready" });
    await start;
    await worker.stop();
    expect(buildWorker).toHaveBeenCalledTimes(2);
  });

  it("builds once for the workers of a root", async () => {
    const pool = quickjsPool();
    for (let i = 0; i < 2; i++) {
      const { worker, thread, start } = await booting(pool);
      thread.report({ kind: "ready" });
      await start;
      await worker.stop();
    }
    expect(buildWorker).toHaveBeenCalledOnce();
  });
});

describe("two workers of one pool", () => {
  it("run together, each with its own thread", async () => {
    const pool = quickjsPool();
    const first = await booting(pool);
    const second = await booting(pool);
    first.thread.report({ kind: "ready" });
    second.thread.report({ kind: "ready" });
    await Promise.all([first.start, second.start]);
    first.worker.send({ type: "stop" } as WorkerRequest);
    expect(first.thread.posted).toHaveLength(1);
    expect(second.thread.posted).toEqual([]);
    await Promise.all([first.worker.stop(), second.worker.stop()]);
  });
});

describe("a worker whose thread failed to start", () => {
  it("stays inert after the thread reported a failure", async () => {
    const { worker, thread, start } = await booting();
    const errors: unknown[] = [];
    worker.on("error", (error: unknown) => errors.push(error));
    thread.report({ kind: "failed", value: new Error("prelude failed") });
    await expect(start).rejects.toThrow("prelude failed");
    worker.send({ type: "stop" } as WorkerRequest);
    expect(thread.posted).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("a worker that ends", () => {
  it("rejects a start that is stopped while the thread boots", async () => {
    const { worker, start } = await booting();
    await worker.stop();
    await expect(start).rejects.toThrow("the thread of the worker ended before it was ready");
  });

  it("rejects a start that is stopped while it prepares and creates no thread for it", async () => {
    let created = false;
    void nextThread().then(() => (created = true));
    const worker = createWorker();
    const start = worker.start();
    await worker.stop();
    await expect(start).rejects.toThrow("the worker was stopped before it started");
    expect(created).toBe(false);
  });

  it("emits an error when the thread exits without a stop", async () => {
    const { worker, thread, errors } = await started();
    thread.exit();
    expect(errors).toMatchObject([{ message: "the thread of the worker ended" }]);
    await worker.stop();
  });

  it("emits no error for a stop", async () => {
    const { worker, errors } = await started();
    await worker.stop();
    expect(errors).toEqual([]);
  });

  it("terminates the thread on a stop", async () => {
    const { worker, thread } = await started();
    const terminate = vi.spyOn(thread, "terminate");
    await worker.stop();
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe("stop", () => {
  it("is safe on a worker that was never started and safe to call twice", async () => {
    await expect(createWorker().stop()).resolves.toBeUndefined();
    const { worker } = await started();
    await worker.stop();
    await expect(worker.stop()).resolves.toBeUndefined();
  });
});

describe("the extensions of a worker", () => {
  const loaded = async (pool: ReturnType<typeof quickjsPool>) => {
    const { worker, thread, start } = await booting(pool);
    thread.report({ kind: "ready" });
    await start;
    await worker.stop();
    return {
      extensions: (thread.workerData.extensions as { name: string }[]).map(({ name }) => name),
      visible: thread.workerData.visible,
    };
  };

  it("are the two that vitest needs, and both stay hidden, by default", async () => {
    expect(await loaded(quickjsPool())).toEqual({ extensions: ["url", "encoding"], visible: [] });
  });

  it("add the listed ones, which stay visible", async () => {
    expect(await loaded(quickjsPool({ extensions: ["crypto", "url"] }))).toEqual({
      extensions: ["url", "encoding", "crypto"],
      visible: ["crypto", "url"],
    });
  });
});

describe("a prelude given as a path relative to the root", () => {
  it("is read from the root", async () => {
    const file = path.join(await tempDir(), "prelude.js");
    await writeFile(file, "globalThis.a = 1;");
    const relative = path.relative(root, file);
    const { worker, thread, start } = await booting(quickjsPool({ preludes: [relative] }));
    expect(thread.workerData.preludes).toEqual([{ name: relative, code: "globalThis.a = 1;" }]);
    thread.report({ kind: "ready" });
    await start;
    await worker.stop();
  });
});

describe("a worker that starts again after its prelude changed", () => {
  it("runs the prelude as it is now", async () => {
    const file = path.join(await tempDir(), "prelude.js");
    const pool = quickjsPool({ preludes: [file] });
    const codes: unknown[] = [];
    for (const version of ["first", "second"]) {
      await writeFile(file, `console.log("prelude ${version}");`);
      const { worker, thread, start } = await booting(pool);
      codes.push(thread.workerData.preludes);
      thread.report({ kind: "ready" });
      await start;
      await worker.stop();
    }
    expect(codes).toEqual([
      [{ name: file, code: 'console.log("prelude first");' }],
      [{ name: file, code: 'console.log("prelude second");' }],
    ]);
  });

  it("takes the snapshot again", async () => {
    const file = path.join(await tempDir(), "prelude.js");
    const pool = quickjsPool({ preludes: [file] });
    await writeFile(file, "globalThis.a = 1;");
    const first = await booting(pool);
    first.thread.report({ kind: "snapshot", value: { clock: 1 } as ContextSnapshot });
    first.thread.report({ kind: "ready" });
    await first.start;
    await writeFile(file, "globalThis.a = 2;");
    const second = await booting(pool);
    expect(second.thread.workerData.takeSnapshot).toBe(true);
    expect(second.thread.workerData.snapshot).toBeUndefined();
    await first.worker.stop();
    await second.worker.stop();
    await second.start.catch(() => {});
  });
});

describe("the snapshot of a pool", () => {
  const snapshot = (clock: number) => ({ clock }) as ContextSnapshot;

  it("is taken by the first worker and given to the next", async () => {
    const pool = quickjsPool();
    const first = await booting(pool);
    expect(first.thread.workerData).toMatchObject({ takeSnapshot: true });
    // a worker that starts while the first takes the snapshot does not take one too
    const meanwhile = await booting(pool);
    expect(meanwhile.thread.workerData.takeSnapshot).toBeUndefined();
    first.thread.report({ kind: "snapshot", value: snapshot(1) });
    first.thread.report({ kind: "ready" });
    await first.start;
    const next = await booting(pool);
    expect(next.thread.workerData.snapshot).toEqual(snapshot(1));
    expect(next.thread.workerData.takeSnapshot).toBeUndefined();
    await Promise.all([first.worker.stop(), meanwhile.worker.stop(), next.worker.stop()]);
    await Promise.allSettled([meanwhile.start, next.start]);
  });

  it("is not taken when the option is false", async () => {
    const { worker, thread, start } = await booting(quickjsPool({ snapshot: false }));
    expect(thread.workerData.takeSnapshot).toBeUndefined();
    expect(thread.workerData.snapshot).toBeUndefined();
    await worker.stop();
    await start.catch(() => {});
  });

  it.each(["boots", "prepares"])(
    "is taken by the next start after one stopped while it %s",
    async (when) => {
      const pool = quickjsPool();
      if (when === "boots") {
        const first = await booting(pool);
        await first.worker.stop();
        await first.start.catch(() => {});
      } else {
        const first = createWorker(pool);
        const start = first.start();
        await first.stop();
        await start.catch(() => {});
      }
      const second = await booting(pool);
      expect(second.thread.workerData).toMatchObject({ takeSnapshot: true });
      second.thread.report({ kind: "snapshot", value: snapshot(2) });
      second.thread.report({ kind: "ready" });
      await second.start;
      const third = await booting(pool);
      expect(third.thread.workerData).toMatchObject({ snapshot: snapshot(2) });
      await second.worker.stop();
      await third.worker.stop();
      await third.start.catch(() => {});
    },
  );

  it("keeps one snapshot for each environment", async () => {
    const pool = quickjsPool();
    for (const [A, clock] of [
      ["1", 1],
      ["2", 2],
    ] as const) {
      const { worker, thread, start } = await booting(pool, { A });
      expect(thread.workerData).toMatchObject({ takeSnapshot: true, env: { A } });
      thread.report({ kind: "snapshot", value: snapshot(clock) });
      thread.report({ kind: "ready" });
      await start;
      await worker.stop();
    }
    for (const [A, clock] of [
      ["1", 1],
      ["2", 2],
    ] as const) {
      const { worker, thread, start } = await booting(pool, { A });
      expect(thread.workerData).toMatchObject({ snapshot: snapshot(clock) });
      await worker.stop();
      await start.catch(() => {});
    }
  });
});
