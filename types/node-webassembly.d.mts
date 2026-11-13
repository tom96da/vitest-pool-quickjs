// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/** Node has WebAssembly, but its types declare none. This declares the part that the pool uses. */
declare namespace WebAssembly {
  class Module {}
  function compile(bytes: Uint8Array): Promise<Module>;
}
