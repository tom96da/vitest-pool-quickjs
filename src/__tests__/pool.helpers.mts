// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { onTestFinished } from "vitest";

import { quickjsPool } from "../index.mts";
import { nextThread } from "./pool.fake-worker.mts";

export const root = import.meta.dirname;

/**
 * Makes the worker of a pool for the fixture root.
 * @param pool - the pool
 * @param env - the environment that vitest gives the worker
 * @returns the worker
 */
export const createWorker = (pool = quickjsPool(), env: Record<string, string> = {}) =>
  pool.createPoolWorker({ project: { config: { root, fsModuleCache: false } }, env } as never);

/**
 * Starts a worker and waits until the pool has created its thread, which has not reported yet.
 * @param pool - the pool
 * @param env - the environment that vitest gives the worker
 * @returns the worker, its thread and the start, which settles when the thread reports
 */
export async function booting(pool?: ReturnType<typeof quickjsPool>, env?: Record<string, string>) {
  const worker = createWorker(pool, env);
  const created = nextThread();
  const start = worker.start();
  const thread = await created;
  return { worker, thread, start };
}

/**
 * Starts a worker whose thread reports that it is ready, and collects its errors.
 * @returns the worker, its thread and the errors it emitted
 */
export async function started() {
  const { worker, thread, start } = await booting();
  const errors: unknown[] = [];
  worker.on("error", (error: unknown) => errors.push(error));
  thread.report({ kind: "ready" });
  await start;
  return { worker, thread: thread, errors };
}

/**
 * Waits for a timer of Node.
 * @param ms - the delay in milliseconds
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Makes a temporary directory that is removed when the test ends.
 * @returns the path of the directory
 */
export async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "pool-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
