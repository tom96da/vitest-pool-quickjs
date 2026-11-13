// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The types of the modules of Node that the tests import in the context. The pool has no module for
// them and serves each as an inert module, and the project of the context has no types of Node. The
// tests check the exports of an inert module, so each declaration lists only those exports. The
// other modules of Node are typed from `src/shims`.

declare module "node:cluster" {
  export const isPrimary: boolean;
}
declare module "node:events" {
  export class EventEmitter {}
  const events: { EventEmitter: typeof EventEmitter };
  export default events;
}
declare module "node:http" {
  export const METHODS: string[];
  export const STATUS_CODES: Record<string, string>;
  export const maxHeaderSize: number;
  export function createServer(): undefined;
}
declare module "node:os" {
  const os: { EOL: string };
  export default os;
}
