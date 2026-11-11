// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The value is gone after an `await` inside `run()`: QuickJS has no async context to follow.
export class AsyncLocalStorage<T> {
  private stores: T[] = [];
  getStore(): T | undefined {
    return this.stores.at(-1);
  }
  run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    this.stores.push(store);
    try {
      return callback(...args);
    } finally {
      this.stores.pop();
    }
  }
  disable(): void {
    this.stores = [];
  }
}
export const createHook = () => ({ enable() {}, disable() {} });
export default { AsyncLocalStorage, createHook };
