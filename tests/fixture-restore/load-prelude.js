// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// the scripts that run before the worker take their time, note the time and write to the output
// while they load
const until = __now() + 200;
while (__now() < until);
globalThis.loadedAt = __now();
__stdout("prelude-output\n");
