// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

interface RunOptions {
  filename?: string;
}

// The file name makes `Error` stacks name the file. vitest reads it to find the caller of vi.mock.
export function runInThisContext(code: string, options?: RunOptions): unknown {
  __evalFile(code, options?.filename ?? "evalmachine.<anonymous>");
  const result = globalThis.__evalResult;
  globalThis.__evalResult = undefined;
  return result;
}

export const runInContext = runInThisContext;

// Tests call this as `gc`: allocating and dropping cyclic objects makes QuickJS collect the weak
// references that a test waits for.
export const runInNewContext = (): (() => void) => () => {
  let keep: object[] = [];
  for (let i = 0; i < 100_000; i++) {
    const a: { self?: object } = {};
    a.self = a;
    keep.push(a);
  }
  keep = [];
};

export class Script {
  private code: string;
  constructor(code: string) {
    this.code = code;
  }
  runInThisContext(options?: RunOptions): unknown {
    return runInThisContext(this.code, options);
  }
}
export default { runInThisContext, runInContext, runInNewContext, Script };
