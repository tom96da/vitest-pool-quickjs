// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/** The globals that the pool and the worker define in the QuickJS context. */
declare global {
  /** Milliseconds since the context started. */
  function __now(): number;
  /** Sends one encoded message to the pool. */
  function __post(text: string): void;
  /** Writes to the standard output of the process. */
  function __stdout(text: string): void;
  /** Writes to the standard error of the process. */
  function __stderr(text: string): void;
  /** Evaluates code under a file name, so that `Error` stacks name that file. */
  function __evalFile(code: string, filename: string): void;
  /** The result of the last `__evalFile` call. */
  var __evalResult: unknown;
  /** Receives one encoded message from the pool. The worker defines it. */
  var __onMessage: ((text: string) => void) | undefined;
  /** Imports a module that the server externalized. The worker defines it. */
  var __externalImport: ((file: string) => Promise<unknown>) | undefined;
}

export {};
