// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { WorkerRequest } from "vitest/node";

import { quickjsPool } from "../index.mts";
import { encode } from "../worker/codec.mts";
import { root, started } from "./pool.helpers.mts";

// the factories come from a dynamic import, which runs when the module is mocked
vi.mock("node:worker_threads", async (importOriginal) =>
  (await import("./pool.mocks.mts")).workerThreadsFactory(importOriginal),
);
vi.mock("../bundle.mts", async (importOriginal) =>
  (await import("./pool.mocks.mts")).bundleFactory(importOriginal),
);

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

  it("posts a message that can be sent to the thread", async () => {
    const { worker, thread } = await started();
    worker.send({ type: "stop" } as WorkerRequest);
    expect(thread.posted).toEqual([encode({ type: "stop" })]);
    await worker.stop();
  });
});

describe("the error event of a pump", () => {
  it("carries the error that the thread reports", async () => {
    const { worker, thread, errors } = await started();
    thread.report({ kind: "error", value: new Error("delay failed") });
    expect(errors).toEqual([new Error("delay failed")]);
    await worker.stop();
  });
});

describe("the reports of a stopped thread", () => {
  it("reach nothing outside", async () => {
    const { worker, thread, errors } = await started();
    const messages: unknown[] = [];
    worker.on("message", (message: unknown) => messages.push(message));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      // the thread drops its listeners when it exits, so the report comes while it ends
      const stopping = worker.stop();
      thread.report({ kind: "message", value: encode({ type: "late" }) });
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

describe("the reports of a started thread", () => {
  it("reach the worker and the output", async () => {
    const { worker, thread } = await started();
    const messages: unknown[] = [];
    worker.on("message", (message: unknown) => messages.push(message));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      thread.report({ kind: "stdout", value: "out" });
      thread.report({ kind: "stderr", value: "err" });
      thread.report({ kind: "message", value: encode({ type: "hello" }) });
      expect(stdout).toHaveBeenCalledWith("out");
      expect(stderr).toHaveBeenCalledWith("err");
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(messages).toEqual([{ type: "hello" }]);
    await worker.stop();
  });
});

describe("the error event of a started thread", () => {
  const fail = async () => {
    const { worker, thread, errors } = await started();
    const error = new Error("boom");
    thread.emit("error", error);
    return { worker, thread, errors, error };
  };

  it("reaches the error event of the worker once", async () => {
    const { worker, errors, error } = await fail();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(error);
    await worker.stop();
  });

  it("terminates the thread", async () => {
    const { worker, thread, errors } = await started();
    const terminate = vi.spyOn(thread, "terminate");
    thread.emit("error", new Error("boom"));
    expect(terminate).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
    await worker.stop();
  });
});

describe("the options of a pool", () => {
  it("refuses a snapshot option that is not a boolean", () => {
    expect(() => quickjsPool({ snapshot: "false" as never })).toThrow(
      'the snapshot option takes true or false, not "false"',
    );
  });

  it("names an extension that does not exist and the valid ones", () => {
    expect(() => quickjsPool({ extensions: ["nope" as never] })).toThrow(
      'unknown extension "nope" in the extensions option. ' +
        "it accepts url, encoding, headers, crypto, structured-clone",
    );
  });

  it("names the option to set when the file system cache of vitest is on", () => {
    expect(() =>
      quickjsPool().createPoolWorker({
        project: { config: { root, fsModuleCache: true } },
        env: {},
      } as never),
    ).toThrow("set `fsModuleCache: false` in the test options");
  });
});
