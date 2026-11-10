// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Only what vitest uses: each method writes formatted lines to the stream of its level.

import { format } from "vitest/internal/browser";

import type { Writable } from "./stream.mts";

interface Streams {
  stdout: Writable;
  stderr: Writable;
  groupIndentation?: number;
}

export class Console {
  private indent = "";
  private counts = new Map<string, number>();
  private streams: Streams;
  constructor(streams: Streams) {
    this.streams = streams;
  }
  private out(to: "stdout" | "stderr", args: unknown[]): void {
    const text = (args.length ? format(args) : "").replace(/^/gm, this.indent);
    this.streams[to].write(`${text}\n`);
  }
  private step(): number {
    return this.streams.groupIndentation ?? 2;
  }
  log = (...a: unknown[]) => this.out("stdout", a);
  info = this.log;
  debug = this.log;
  table = this.log;
  dir = (o: unknown) => this.out("stdout", [o]);
  warn = (...a: unknown[]) => this.out("stderr", a);
  error = this.warn;
  trace = (...a: unknown[]) => this.out("stderr", ["Trace:", ...a]);
  assert = (ok: unknown, ...a: unknown[]) => {
    if (!ok) this.out("stderr", ["Assertion failed", ...a]);
  };
  count = (label = "default") => {
    const n = (this.counts.get(label) ?? 0) + 1;
    this.counts.set(label, n);
    this.out("stdout", [`${label}: ${n}`]);
  };
  countReset = (label = "default") => void this.counts.delete(label);
  group = (...a: unknown[]) => {
    if (a.length) this.log(...a);
    this.indent += " ".repeat(this.step());
  };
  groupEnd = () => {
    this.indent = this.indent.slice(this.step());
  };
  time = () => {};
  timeEnd = () => {};
  timeLog = () => {};
}
export default { Console };
