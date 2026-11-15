// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Not part of the package. It declares the exports of these modules of Node that the fixtures use.

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
declare module "node:v8" {
  const v8: { url: string };
  export default v8;
}
