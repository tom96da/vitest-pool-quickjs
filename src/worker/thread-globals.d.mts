// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * What the thread and the worker hand to each other. Neither is a global of the context for long:
 * the thread sets `__host` before the scripts run and the prelude takes it, and the worker sets
 * `__guest` as its last step and the thread takes it. Both stay in the memory of a snapshot.
 */

/** The functions and values that the thread gives the context. */
interface Host {
  /** Milliseconds since the context started. */
  now(): number;
  /** Sends one encoded message to the pool. */
  post(text: string): void;
  /** Writes to the standard output of the process. */
  stdout(text: string): void;
  /** Writes to the standard error of the process. */
  stderr(text: string): void;
  /** Collects the garbage of the context, so that weak references to dead objects clear. */
  gc(): void;
  /** Evaluates code under a file name, so that `Error` stacks name that file. */
  evalFile(code: string, filename: string): unknown;
  /** Reads a text file of the file system, or `undefined` when there is none. */
  readFile(file: string): Promise<string | undefined>;
  /** Writes a text file and the directories above it. */
  writeFile(file: string, text: string): Promise<void>;
  /** Removes a file, if there is one. */
  removeFile(file: string): Promise<void>;
  /**
   * The rejections that no handler has seen, by promise. The thread writes an entry when a promise
   * rejects without a handler and sets it to `undefined` when a handler arrives.
   */
  rejections: Record<string, { promise: Promise<unknown>; reason: unknown } | undefined>;
  /** The environment variables that vitest resolves for the worker. */
  env: Record<string, string>;
  /** The extensions that the option lists. Their globals stay visible to the tests. */
  visible: string[];
}

/** The functions of the context that the thread calls. */
interface Guest {
  /** The same object as `Host.rejections`, which the thread finds again after a restore. */
  rejections: Host["rejections"];
  /** Reports the rejections that no handler took, to the listeners of `process`. */
  flushRejections(): void;
  /** Runs the earliest due timer and returns 1, or returns 0 when none is due. */
  fireTimers(): number;
  /** The milliseconds until the next timer is due, or -1 when there is none. */
  timerDelay(): number;
  /** Receives one encoded message from the pool. The worker defines it. */
  onMessage(text: string): void;
  /** Imports a module that the server externalized. The worker defines it. */
  externalImport(file: string): Promise<unknown>;
}

declare global {
  var __host: Host | undefined;
  var __guest: Guest | undefined;
}

export type { Guest, Host };
