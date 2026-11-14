// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that QuickJS provides in a context, the ones of the engine and the ones of the
// extensions of quickjs-wasi. The globals that the prelude defines are in `src/worker/prelude-globals.d.mts`.

declare global {
  // the engine
  function queueMicrotask(callback: () => void): void;
  var performance: { now(): number; timeOrigin: number };

  // the url extension
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

  // the encoding extension
  interface TextDecoderOptions {
    fatal?: boolean;
    ignoreBOM?: boolean;
  }
  var TextDecoder: {
    new (
      label?: string,
      options?: TextDecoderOptions,
    ): { decode(input?: ArrayBuffer | ArrayBufferView): string };
  };
  var TextEncoder: { new (): { encode(input?: string): Uint8Array } };

  // the structured-clone, crypto and headers extensions
  function structuredClone<T>(value: T): T;
  var crypto: { randomUUID(): string };
  var Headers: {
    new (init?: Record<string, string>): { get(name: string): string | null };
  };
}

export {};
