// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { VitestSnapshotEnvironment } from "vitest/runtime";

import { host } from "./host.mts";

/**
 * The snapshot environment of the context. It reads and writes the files through the thread,
 * because the context has no file system.
 */
export class SnapshotEnvironment extends VitestSnapshotEnvironment {
  private readonly testFiles: Set<string>;

  /**
   * @param testFiles - the paths of the test files of the run
   */
  constructor(testFiles: string[]) {
    super();
    this.testFiles = new Set(testFiles);
  }

  override async saveSnapshotFile(file: string, text: string): Promise<void> {
    await host.writeFile(file, text);
  }

  // vitest reads the test file only to write an inline snapshot into it, at a position that the
  // context does not report for a call that spans lines
  override async readSnapshotFile(file: string): Promise<string | null> {
    if (this.testFiles.has(file)) {
      throw new Error(
        `cannot write an inline snapshot into ${file}. ` +
          "use toMatchSnapshot or write the expected value by hand",
      );
    }
    return (await host.readFile(file)) ?? null;
  }

  override async removeSnapshotFile(file: string): Promise<void> {
    await host.removeFile(file);
  }
}
