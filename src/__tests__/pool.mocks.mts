// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { vi } from "vitest";

/**
 * Makes the replacement of `node:worker_threads` that gives the pool a fake thread. A test file
 * passes it to `vi.mock` with a dynamic import, because the mock applies before the imports of the
 * file run.
 * @param importOriginal - gives the real module
 * @returns the module with `Worker` replaced
 */
export async function workerThreadsFactory(
  importOriginal: () => Promise<typeof import("node:worker_threads")>,
) {
  const { FakeWorker } = await import("./pool.fake-worker.mts");
  return { ...(await importOriginal()), Worker: FakeWorker };
}

/**
 * Makes the replacement of the bundle that builds nothing. The fake thread never runs the script,
 * so the build only has to give a string.
 * @param importOriginal - gives the real module
 * @returns the module with `buildWorker` replaced by a mock
 */
export async function bundleFactory(
  importOriginal: () => Promise<typeof import("../bundle.mts")>,
): Promise<Record<string, unknown>> {
  const actual = await importOriginal();
  return { ...actual, buildWorker: vi.fn<typeof actual.buildWorker>(async () => "the worker") };
}
