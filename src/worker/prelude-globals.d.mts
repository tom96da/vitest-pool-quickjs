// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that the prelude defines in the context. The engine has none of them.

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

  var performance: { now(): number; timeOrigin: number };

  var process: {
    env: Record<string, string | undefined>;
    argv: string[];
    platform: string;
    versions: Record<string, string>;
    execPath?: string;
    cwd(): string;
    nextTick(callback: () => void): void;
    emitWarning(): void;
    listeners(name: string): ProcessListener[];
    on(name: string, listener: ProcessListener): typeof process;
    once(name: string, listener: ProcessListener): typeof process;
    off(name: string, listener: ProcessListener): typeof process;
    removeListener(name: string, listener: ProcessListener): typeof process;
    removeAllListeners(name?: string): typeof process;
    memoryUsage(): { heapUsed: number };
    exit(code?: number): never;
    hrtime: { (): [number, number]; bigint(): bigint };
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
  var AbortController: {
    new (): { readonly signal: AbortSignal; abort(reason?: unknown): void };
  };

  // the url extension defines them too, with more members
  interface URLSearchParams {
    append(name: string, value: unknown): void;
    delete(name: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    toString(): string;
  }
  var URLSearchParams: { new (init?: string): URLSearchParams };

  interface URL {
    readonly href: string;
    readonly protocol: string;
    readonly host: string;
    readonly hostname: string;
    readonly port?: string;
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly origin: string;
    readonly searchParams: URLSearchParams;
    toString(): string;
    toJSON(): string;
  }
  var URL: { new (url: string | URL, base?: string | URL): URL };
}

export {};
