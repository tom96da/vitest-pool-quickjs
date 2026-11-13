// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * The globals that the thread defines in the QuickJS context as host functions, and the two that
 * the worker defines for the thread to call.
 */
declare global {
  /** Milliseconds since the context started. */
  function __now(): number;
  /**
   * The rejections that no handler has seen, by promise. The thread writes an entry when a promise
   * rejects without a handler and sets it to `undefined` when a handler arrives.
   */
  var __rejections: Record<string, { promise: Promise<unknown>; reason: unknown } | undefined>;
  /** Sends one encoded message to the pool. */
  function __post(text: string): void;
  /** Writes to the standard output of the process. */
  function __stdout(text: string): void;
  /** Writes to the standard error of the process. */
  function __stderr(text: string): void;
  /** Collects the garbage of the context, so that weak references to dead objects clear. */
  function __gc(): void;
  /** Evaluates code under a file name, so that `Error` stacks name that file. */
  function __evalFile(code: string, filename: string): void;
  /** Reads a text file of the file system, or `undefined` when there is none. */
  function __readFile(file: string): Promise<string | undefined>;
  /** Writes a text file and the directories above it. */
  function __writeFile(file: string, text: string): Promise<void>;
  /** Removes a file, if there is one. */
  function __removeFile(file: string): Promise<void>;
  /** The result of the last `__evalFile` call. */
  var __evalResult: unknown;
  /** Receives one encoded message from the pool. The worker defines it. */
  var __onMessage: ((text: string) => void) | undefined;
  /** Imports a module that the server externalized. The worker defines it. */
  var __externalImport: ((file: string) => Promise<unknown>) | undefined;
}

export {};
