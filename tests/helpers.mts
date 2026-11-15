// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Waits for a timer of the context.
 * @param ms - the delay in milliseconds
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Collects what the context reports to the listeners of a process event while a body runs.
 * @param event - the name of the event
 * @param body - the code that may cause the event
 * @returns the arguments of every call of the listener
 */
export async function collect(
  event: "unhandledRejection" | "uncaughtException",
  body: () => void | Promise<void>,
): Promise<unknown[]> {
  const reported: unknown[] = [];
  const listener = (reason: unknown) => reported.push(reason);
  process.on(event, listener);
  await body();
  await sleep(0);
  process.off(event, listener);
  return reported;
}
