// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// what an external finds in the context while it loads
const names = [
  "EventTarget",
  "Event",
  "AbortController",
  "URL",
  "URLSearchParams",
  "TextDecoder",
  "TextEncoder",
];
exports.hidden = names.filter((name) => typeof globalThis[name] !== "undefined");
exports.visible = ["process", "setTimeout", "performance"].filter(
  (name) => typeof globalThis[name] === "undefined",
);
exports.helpers = Object.keys(globalThis).filter((name) => name.startsWith("__"));
exports.fromSetup = typeof globalThis.fromSetup;
