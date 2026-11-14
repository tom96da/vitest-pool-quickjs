// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that the prelude defines in the context, and the ones it hides from the tests and
// gives to vitest alone. The engine has none of them.

declare global {
  type ProcessListener = (...args: unknown[]) => void;
  type AbortListener = (event: { type: string }) => void;

  interface Console {
    assert(condition?: unknown, ...data: unknown[]): void;
    count(label?: string): void;
    countReset(label?: string): void;
    debug(...data: unknown[]): void;
    dir(item?: unknown, options?: unknown): void;
    error(...data: unknown[]): void;
    group(...data: unknown[]): void;
    groupEnd(): void;
    info(...data: unknown[]): void;
    log(...data: unknown[]): void;
    table(data?: unknown, columns?: string[]): void;
    time(label?: string): void;
    timeEnd(label?: string): void;
    timeLog(label?: string, ...data: unknown[]): void;
    trace(...data: unknown[]): void;
    warn(...data: unknown[]): void;
  }
  var console: Console;

  function setTimeout(
    callback: (...args: any[]) => void,
    delay?: number,
    ...args: unknown[]
  ): number;
  function setInterval(
    callback: (...args: any[]) => void,
    delay?: number,
    ...args: unknown[]
  ): number;
  function clearTimeout(id: number | undefined): void;
  function clearInterval(id: number | undefined): void;

  var process: {
    env: Record<string, string | undefined>;
    versions: Record<string, string>;
    cwd(): string;
    listeners(name: string): ProcessListener[];
    on(name: string, listener: ProcessListener): typeof process;
    once(name: string, listener: ProcessListener): typeof process;
    off(name: string, listener: ProcessListener): typeof process;
    removeListener(name: string, listener: ProcessListener): typeof process;
    removeAllListeners(name?: string): typeof process;
    memoryUsage(): { heapUsed: number };
    stdout: { write(text: string, callback?: () => void): boolean };
    stderr: { write(text: string, callback?: () => void): boolean };
  };

  interface AbortSignal {
    readonly aborted: boolean;
    readonly reason: unknown;
    addEventListener(type: string, listener: AbortListener): void;
    removeEventListener(type: string, listener: AbortListener): void;
    throwIfAborted(): void;
  }
}

export {};
