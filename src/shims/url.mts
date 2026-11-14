// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// vitest calls fileURLToPath(import.meta.url) while it loads. `import.meta` is empty in the worker
// bundle, so the argument can be undefined.
export const fileURLToPath = (url?: string | { href: string } | null): string =>
  decodeURIComponent(
    String(typeof url === "object" && url ? url.href : url).replace(/^file:\/\//, ""),
  );
export const URL = globalThis.URL;
// vitest also passes the specifier of a package that it could not resolve, which is not a path and
// which a URL parser rejects. The module runner reads it back as it is.
export const pathToFileURL = (path: string) => {
  const href = `file://${path}`;
  return path.startsWith("/") ? new URL(href) : { href, toString: () => href };
};
export default { fileURLToPath, pathToFileURL, URL };
