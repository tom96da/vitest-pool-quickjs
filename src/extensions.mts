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
