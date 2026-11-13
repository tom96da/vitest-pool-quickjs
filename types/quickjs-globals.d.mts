// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that QuickJS provides in a context, the ones of the engine and the ones of the
// extensions of quickjs-wasi. The globals that the prelude defines are in `src/worker/prelude-globals.d.mts`.

declare global {
  // the engine
  function queueMicrotask(callback: () => void): void;

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
