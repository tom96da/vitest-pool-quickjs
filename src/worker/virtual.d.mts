// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

declare module "virtual:externals" {
  /** The modules `externals` lists, by specifier and by resolved path. */
  const externals: Record<string, unknown>;
  export default externals;
}
