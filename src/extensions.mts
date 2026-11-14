// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/** The extensions of quickjs-wasi that a context can load. */
export const knownExtensions = [
  "url",
  "encoding",
  "headers",
  "crypto",
  "structured-clone",
] as const;

/** An extension of quickjs-wasi. */
export type Extension = (typeof knownExtensions)[number];

/**
 * The extensions that vitest needs, with the globals that each defines. The tests see these
 * globals only when the option lists the extension.
 */
export const internalExtensions = {
  url: ["URL", "URLSearchParams"],
  encoding: ["TextDecoder", "TextEncoder"],
} as const;

/** The globals that the pool defines itself, which no test sees. */
export const ownGlobals = ["EventTarget", "Event", "AbortController"] as const;
