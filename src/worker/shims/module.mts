// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

export const builtinModules: string[] = [];
export const createRequire = () => () => ({});
export const isBuiltin = (): boolean => false;
export const syncBuiltinESMExports = (): void => {};
export default { createRequire, builtinModules, isBuiltin, syncBuiltinESMExports };
