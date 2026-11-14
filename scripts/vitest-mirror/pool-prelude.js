// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The externals include packages of Vitest, which read these globals while they load.
globalThis.EventTarget = class {
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
};
globalThis.Event = class {};
