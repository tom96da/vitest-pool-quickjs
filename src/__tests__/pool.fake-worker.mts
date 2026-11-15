// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EventEmitter } from "node:events";

import type { Report } from "../types.mts";

let created: (thread: FakeWorker) => void = () => {};

/**
 * Waits for the next thread that the pool creates. Call it before the start that creates the thread.
 * @returns the thread
 */
export const nextThread = () => new Promise<FakeWorker>((resolve) => (created = resolve));

/**
 * The `Worker` of `node:worker_threads` as far as the pool uses it. Nothing runs in it. The test
 * plays the thread through `report` and `exit`, so it decides when the thread is ready.
 */
export class FakeWorker extends EventEmitter {
  readonly workerData: Record<string, unknown>;
  readonly posted: unknown[] = [];
  private ended = false;

  constructor(_url: URL, options: { workerData: Record<string, unknown> }) {
    super();
    this.workerData = options.workerData;
    created(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  /** Ends the thread as the real one does, after the call, and drops the listeners. */
  async terminate(): Promise<number> {
    await Promise.resolve();
    this.exit();
    return 1;
  }

  /** Plays a report of the thread to the pool. */
  report(report: Report): void {
    this.emit("message", report);
  }

  /** Plays the end of the thread, which drops its listeners. */
  exit(): void {
    if (this.ended) return;
    this.ended = true;
    this.emit("exit", 1);
    this.removeAllListeners();
  }
}
