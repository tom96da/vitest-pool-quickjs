// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EventEmitter } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import dedent from "ts-dedent";
import { describe, expect, it, vi } from "vitest";

import { compile } from "../pool.mts";
import type { Prepared, Report } from "../types.mts";
import { sleep, tempDir } from "./pool.helpers.mts";
import worker from "./thread.worker.js?raw";

// The thread reads these two when it loads, so a test sets them before it imports the thread.
const parent = vi.hoisted(() => ({ port: undefined as unknown, data: undefined as unknown }));

vi.mock("node:worker_threads", () => ({
  get parentPort() {
    return parent.port;
  },
  get workerData() {
    return parent.data;
  },
}));

/** The side of the thread that faces the pool. */
type Port = EventEmitter & { postMessage: ReturnType<typeof vi.fn<(report: Report) => void>> };

/**
 * Starts a thread in this process. The thread runs when its module loads, which ends when it has
 * reported that it is ready or that it failed.
 * @param options - what the pool prepares for the thread, besides the engine
 * @returns the port of the thread
 */
async function start(options: Partial<Prepared> = {}): Promise<Port> {
  const port: Port = Object.assign(new EventEmitter(), {
    postMessage: vi.fn<(r: Report) => void>(),
  });
  parent.port = port;
  const prepared: Prepared = {
    wasm: await compile("quickjs-wasi/quickjs.wasm"),
    extensions: [],
    visible: [],
    env: {},
    preludes: [],
    worker,
    ...options,
  };
  parent.data = prepared;
  vi.resetModules();
  await import("../thread.mts");
  return port;
}

/**
 * Lists what a thread reported.
 * @param port - the port of the thread
 * @param kind - the kind of report to keep, or all when left out
 * @returns the values of the reports in the order they came
 */
const reports = <K extends Report["kind"]>(port: Port, kind?: K) =>
  port.postMessage.mock.calls
    .map(([report]) => report)
    .filter((report): report is Extract<Report, { kind: K }> => !kind || report.kind === kind);

/**
 * Runs an expression in the context of a thread and waits for the text that the expression gives.
 * @param port - the port of the thread
 * @param expression - the source of an expression, which may be a promise
 * @returns the text of the value, or `rejected` and the message when it rejects
 */
async function ask(port: Port, expression: string): Promise<string> {
  const before = reports(port, "message").length;
  port.emit(
    "message",
    dedent`
      Promise.resolve()
        .then(() => (${expression}))
        .then((value) => __host.post(String(value)), (error) => __host.post("rejected " + error.message));
    `,
  );
  await vi.waitFor(() => expect(reports(port, "message")).toHaveLength(before + 1), {
    interval: 2,
  });
  return reports(port, "message")[before]!.value;
}

describe("the output of a thread", () => {
  it("reports what a prelude writes to stdout as stdout", async () => {
    const port = await start({
      preludes: [{ name: "out.js", code: `__host.stdout("to stdout\\n");` }],
    });
    expect(reports(port, "stdout")).toEqual([{ kind: "stdout", value: "to stdout\n" }]);
    expect(reports(port, "stderr")).toEqual([]);
  });

  it("reports what the context writes to stderr as stderr", async () => {
    const port = await start();
    port.emit("message", `__host.stderr("to stderr\\n");`);
    expect(reports(port, "stderr")).toEqual([{ kind: "stderr", value: "to stderr\n" }]);
    expect(reports(port, "stdout")).toEqual([]);
  });
});

describe("a job that throws", () => {
  it("is reported as an error with the name, the message and the stack", async () => {
    const port = await start();
    port.emit("message", `queueMicrotask(() => { throw new TypeError("job exploded"); });`);
    const value = reports(port, "error")[0]!.value;
    expect(value).toBeInstanceOf(Error);
    expect((value as Error).message).toMatch(/^TypeError: job exploded\n\s+at /);
  });

  it("leaves the thread running", async () => {
    const port = await start();
    port.emit("message", `queueMicrotask(() => { throw new Error("job exploded"); });`);
    expect(await ask(port, `"still here"`)).toBe("still here");
  });
});

describe("the files of a thread", () => {
  it("reads nothing for a file that does not exist and for a path below a file", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "file.txt"), "text");
    const port = await start();
    expect(await ask(port, `__host.readFile(${JSON.stringify(path.join(dir, "none.txt"))})`)).toBe(
      "undefined",
    );
    expect(
      await ask(port, `__host.readFile(${JSON.stringify(path.join(dir, "file.txt", "below"))})`),
    ).toBe("undefined");
  });

  it("rejects when the path is a directory", async () => {
    const dir = await tempDir();
    const port = await start();
    expect(await ask(port, `__host.readFile(${JSON.stringify(dir)})`)).toMatch(/^rejected /);
  });

  it("writes a file and the directories above it", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "a", "b", "file.txt");
    const port = await start();
    await ask(port, `__host.writeFile(${JSON.stringify(file)}, "written")`);
    expect(await readFile(file, "utf8")).toBe("written");
  });

  it("removes a file and does not fail for a file that does not exist", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "file.txt");
    await writeFile(file, "text");
    const port = await start();
    await ask(port, `__host.removeFile(${JSON.stringify(file)})`);
    await expect(readFile(file, "utf8")).rejects.toThrow("ENOENT");
    expect(
      await ask(port, `__host.removeFile(${JSON.stringify(path.join(dir, "none.txt"))})`),
    ).toBe("undefined");
  });
});

describe("a worker that fails to load", () => {
  it("is reported as failed with the error of the script", async () => {
    const port = await start({ worker: `throw new Error("worker broke");` });
    const value = reports(port, "failed")[0]!.value;
    expect((value as Error).message).toMatch(/^Error: worker broke\n\s+at .*worker\.js/);
    expect(reports(port, "ready")).toEqual([]);
  });
});

describe("the stack of a context", () => {
  it("is limited, so that deep recursion throws instead of ending the thread", async () => {
    const port = await start();
    expect(
      await ask(
        port,
        dedent`
          (() => {
            try {
              return (function recurse() { return recurse() + 1; })();
            } catch (error) {
              return error.name;
            }
          })()
        `,
      ),
    ).toBe("RangeError");
  });
});

describe("a snapshot of a thread", () => {
  it("holds the clock and the output that the scripts wrote while they loaded", async () => {
    const port = await start({
      takeSnapshot: true,
      preludes: [{ name: "out.js", code: `__host.stdout("loaded\\n");` }],
    });
    port.emit("message", `__host.stdout("later\\n");`);
    const value = reports(port, "snapshot")[0]!.value;
    expect(value.output).toEqual([{ kind: "stdout", value: "loaded\n" }]);
    expect(value.clock).toBeGreaterThan(0);
    expect(reports(port).map((report) => report.kind)).toEqual([
      "stdout",
      "snapshot",
      "ready",
      "stdout",
    ]);
  });
});

describe("a thread that starts from a snapshot", () => {
  // The first thread loads a prelude that takes its time, notes the time and writes to the output,
  // and then leaves a global behind. The second thread starts from what the first one took.
  const prelude = dedent`
    while (__host.now() < 30);
    globalThis.loadedAt = performance.now();
    globalThis.hostLoadedAt = __host.now();
    __host.stdout("loaded\\n");
  `;

  /**
   * @param pause - the milliseconds between the two starts
   * @returns the two ports and the times that the first start noted while it loaded
   */
  async function restart(pause = 0) {
    const first = await start({
      takeSnapshot: true,
      preludes: [{ name: "load.js", code: prelude }],
    });
    first.emit("message", `globalThis.leftBehind = "first";`);
    const snapshot = reports(first, "snapshot")[0]!.value;
    const loadedAt = Number(await ask(first, `loadedAt`));
    const hostLoadedAt = Number(await ask(first, `hostLoadedAt`));
    await sleep(pause);
    const second = await start({ snapshot });
    return { first, second, loadedAt, hostLoadedAt };
  }

  it("repeats the output of the first start", async () => {
    const { second } = await restart();
    expect(reports(second, "stdout")).toEqual([{ kind: "stdout", value: "loaded\n" }]);
    expect(reports(second, "snapshot")).toEqual([]);
  });

  it("continues the clock of the first start", async () => {
    const { second, loadedAt, hostLoadedAt } = await restart();
    expect(hostLoadedAt).toBeGreaterThanOrEqual(30);
    expect(Number(await ask(second, `performance.now()`))).toBeGreaterThanOrEqual(loadedAt);
    expect(Number(await ask(second, `__host.now()`))).toBeGreaterThanOrEqual(hostLoadedAt);
  });

  it("has the time origin of its own thread", async () => {
    const { second } = await restart(100);
    const gap = await ask(
      second,
      `Math.abs(performance.timeOrigin + performance.now() - Date.now())`,
    );
    expect(Number(gap)).toBeLessThan(20);
  });

  it("hands out host functions that work", async () => {
    const { second } = await restart();
    second.emit("message", `__host.stdout("after\\n");`);
    expect(reports(second, "stdout").at(-1)).toEqual({ kind: "stdout", value: "after\n" });
  });

  it("starts without a global that the first start left behind", async () => {
    const { second } = await restart();
    expect(await ask(second, `typeof leftBehind`)).toBe("undefined");
  });
});
