// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Host } from "../thread-globals.d.mts";

const host = {
  writeFile: vi.fn<(file: string, text: string) => Promise<void>>(),
  readFile: vi.fn<(file: string) => Promise<string | undefined>>(),
  removeFile: vi.fn<(file: string) => Promise<void>>(),
};

let SnapshotEnvironment: typeof import("../snapshots.mts").SnapshotEnvironment;

// host.mts takes the handle from the global when it loads, so the stub comes first
beforeAll(async () => {
  Object.assign(globalThis, { __host: host as unknown as Host });
  ({ SnapshotEnvironment } = await import("../snapshots.mts"));
});

describe("the snapshot environment of the context", () => {
  it("writes a snapshot file through the host", async () => {
    await new SnapshotEnvironment([]).saveSnapshotFile("/a.snap", "text");
    expect(host.writeFile).toHaveBeenCalledWith("/a.snap", "text");
  });

  it("reads null for a snapshot file that does not exist", async () => {
    host.readFile.mockResolvedValueOnce(undefined);
    expect(await new SnapshotEnvironment([]).readSnapshotFile("/none.snap")).toBeNull();
  });

  it("removes a snapshot file through the host", async () => {
    await new SnapshotEnvironment([]).removeSnapshotFile("/a.snap");
    expect(host.removeFile).toHaveBeenCalledWith("/a.snap");
  });

  it("refuses to read a test file for an inline snapshot", async () => {
    const environment = new SnapshotEnvironment(["/a.test.ts"]);
    await expect(environment.readSnapshotFile("/a.test.ts")).rejects.toThrow(
      "cannot write an inline snapshot into /a.test.ts",
    );
    expect(host.readFile).not.toHaveBeenCalledWith("/a.test.ts");
  });
});
