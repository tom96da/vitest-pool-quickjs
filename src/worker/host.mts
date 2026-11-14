// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The two handles between the thread and the context. Both sides keep them out of the globals, so
// that no test finds them.

import type { Guest, Host } from "./thread-globals.d.mts";

/** What the thread gives the context. The global goes away, so no test finds it. */
export const host: Host = globalThis.__host!;
Reflect.deleteProperty(globalThis, "__host");

/** What the thread calls in the context. The worker hands it over when it has loaded. */
export const guest = { rejections: host.rejections } as Guest;
