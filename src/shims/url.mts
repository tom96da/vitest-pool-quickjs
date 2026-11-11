// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// vitest calls fileURLToPath(import.meta.url) while it loads. `import.meta` is empty in the worker
// bundle, so the argument can be undefined.
export const fileURLToPath = (url?: string | URL | null): string =>
  decodeURIComponent(
    String(typeof url === "object" && url ? url.href : url).replace(/^file:\/\//, ""),
  );
export const pathToFileURL = (path: string): URL => new URL(`file://${path}`);
export const URL = globalThis.URL;
export default { fileURLToPath, pathToFileURL, URL };
