// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Only what the console of vitest uses: a Writable without a buffer and without events.

interface WritableOptions {
  write(chunk: string, encoding: string, callback: () => void): void;
}

export class Writable {
  private options: WritableOptions;
  constructor(options: WritableOptions) {
    this.options = options;
  }
  write(chunk: unknown, encoding?: unknown, callback?: () => void): boolean {
    const done = typeof encoding === "function" ? (encoding as () => void) : callback;
    this.options.write(String(chunk), "utf8", () => done?.());
    return true;
  }
  end(): void {}
  on(): this {
    return this;
  }
  once(): this {
    return this;
  }
  off(): this {
    return this;
  }
  emit(): boolean {
    return false;
  }
  setMaxListeners(): this {
    return this;
  }
}
export class Readable {}
export class Transform {}
export default { Writable, Readable, Transform };
