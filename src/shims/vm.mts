// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { internalExtensions, ownGlobals } from "../extensions.mts";
import { host } from "../worker/host.mts";

/** The file name under which vitest evaluates the `define` option. */
const definesFile = "virtual:load-defines.js";

/** The extension that defines each global that the context hides from the tests. */
const extensionOf = new Map<string, string | undefined>([
  ...ownGlobals.map((name) => [name, undefined] as const),
  ...Object.entries(internalExtensions).flatMap(([extension, names]) =>
    names.map((name) => [name, extension] as const),
  ),
]);

interface RunOptions {
  filename?: string;
}

// The file name makes `Error` stacks name the file. vitest reads it to find the caller of vi.mock.
export function runInThisContext(code: string, options?: RunOptions): unknown {
  const filename = options?.filename ?? "evalmachine.<anonymous>";
  try {
    return host.evalFile(code, filename);
  } catch (error) {
    const name = /^(\w+) is not defined$/.exec((error as Error)?.message)?.[1];
    if (filename !== definesFile || !name || !extensionOf.has(name)) throw error;
    const extension = extensionOf.get(name);
    throw new ReferenceError(
      `the define option refers to ${name}, which the context does not provide` +
        (extension ? `. list "${extension}" in the extensions option` : ""),
    );
  }
}

export const runInContext = runInThisContext;

// Tests call this as `gc`.
export const runInNewContext = (code: "gc"): (() => void) => {
  if (code !== "gc") {
    throw new Error(`cannot evaluate "${String(code)}" in a new context. only "gc" is supported`);
  }
  return () => host.gc();
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
