// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/** The part of WebAssembly that the pool uses; the libraries of the config declare none. */
declare namespace WebAssembly {
  class Module {}
  function compile(bytes: Uint8Array): Promise<Module>;
}
