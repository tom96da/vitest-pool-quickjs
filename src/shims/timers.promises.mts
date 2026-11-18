// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Only what vitest and its users call: the promise forms of the timers, which run on the timers of
// the context. The options of the real module, such as `signal`, are not supported.

/**
 * Resolves after a delay.
 * @param delay - the delay in milliseconds
 * @param value - what the promise resolves to
 * @returns a promise of the value
 */
export const setTimeout = <T = void,>(delay?: number, value?: T): Promise<T> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, delay, value));

/**
 * Resolves on the next turn of the timers, which is the nearest that the context has to the
 * immediate of Node.js.
 * @param value - what the promise resolves to
 * @returns a promise of the value
 */
export const setImmediate = <T = void,>(value?: T): Promise<T> => setTimeout(0, value);

export default { setTimeout, setImmediate };
