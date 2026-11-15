// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// What the worker hands over when it has loaded. It runs the text of a message as a script, so a
// test can act in the context after the start. Another hand-over format changes only this file.
const host = globalThis.__host;

globalThis.__guest = {
  rejections: host.rejections,
  flushRejections() {},
  fireTimers() {
    return 0;
  },
  timerDelay() {
    return -1;
  },
  onMessage(text) {
    host.evalFile(text, "message.js");
  },
};
