// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that vitest reads while it loads and that QuickJS lacks. This module runs first in
// the worker bundle.
//
// A global stays visible to the tests only when a test needs it. These are `process`, the timers
// and what an extension of the option defines. The rest is exported here, and the bundle gives it
// to the modules of vitest and of the pool in place of the global, so that no test and no external
// finds it.

import { internalExtensions } from "../extensions.mts";
import { guest, host } from "./host.mts";

const visible = new Set(host.visible);

/** The module runner imports what the server externalized through this function. */
export const externalImport = (file: string) => guest.externalImport(file);

/** The listener that `once` registers. It holds the listener it wraps. */
type Wrapper = ProcessListener & { listener: ProcessListener };

/** The listeners of `process`, by event name. */
const listeners = new Map<string, ProcessListener[]>();
const raw = (name: string) => listeners.get(name) ?? [];
const on = (name: string, f: ProcessListener): typeof process => {
  listeners.set(name, [...(listeners.get(name) ?? []), f]);
  return proc;
};
const off = (name: string, f: ProcessListener): typeof process => {
  listeners.set(
    name,
    (listeners.get(name) ?? []).filter((x) => x !== f && (x as Wrapper).listener !== f),
  );
  return proc;
};
const once = (name: string, f: ProcessListener): typeof process => {
  const wrapper: Wrapper = Object.assign(
    (...args: unknown[]) => {
      off(name, wrapper);
      f(...args);
    },
    { listener: f },
  );
  return on(name, wrapper);
};
/** The `process` of the context. */
const proc: typeof process = {
  env: { ...host.env },
  versions: {},
  cwd: () => "/",
  listeners: (name) => (listeners.get(name) ?? []).map((f) => (f as Wrapper).listener ?? f),
  on,
  once,
  off,
  removeListener: off,
  removeAllListeners(name) {
    if (name === undefined) listeners.clear();
    else listeners.delete(name);
    return proc;
  },
  memoryUsage: () => ({ heapUsed: 0 }),
  stdout: { write: (text, callback) => (host.stdout(String(text)), callback?.(), true) },
  stderr: { write: (text, callback) => (host.stderr(String(text)), callback?.(), true) },
};
Object.assign(globalThis, { process: proc });

/** The `EventTarget` of vitest, which has none to read. */
export class EventTarget {
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {}
}
/** The `Event` of vitest, which has none to read. */
export class Event {}

if (!("console" in globalThis)) Object.assign(globalThis, { console: {} });

// The module runner of Vite sets Error.prepareStackTrace to name the error and map the positions to
// the source. QuickJS calls the hook with call sites that lack some methods it uses, and an error in
// the hook leaves the error without a stack. The methods below fill the gap.
{
  const engine = Error as { prepareStackTrace?: (error: Error, sites: object[]) => string };
  let site: object | undefined;
  // the call sites share one prototype, which a throwaway error shows
  engine.prepareStackTrace = (_error, sites) => ((site = Object.getPrototypeOf(sites[0]!)), "");
  void new Error().stack;
  engine.prepareStackTrace = undefined;
  Object.assign(site!, {
    // the file name is the only name of a script that the engine knows
    getScriptNameOrSourceURL(this: { getFileName(): string | null }) {
      return this.getFileName();
    },
    // the engine does not mark code from eval, so the hook never asks for its origin
    isEval: () => false,
    // the engine does not tell the receiver of a call, so a method shows as `m` where V8 shows `Class.m`
    isToplevel: () => true,
    // the hook returns a call site that it could not map as it is, and joins it as text
    toString(this: {
      isNative(): boolean;
      isConstructor(): boolean;
      getFileName(): string | null;
      getFunctionName(): string | null;
      getLineNumber(): number | null;
      getColumnNumber(): number | null;
    }) {
      const line = this.getLineNumber();
      const column = this.getColumnNumber();
      const file = this.isNative()
        ? "native"
        : `${this.getFileName() ?? "<anonymous>"}${line == null ? "" : `:${line}${column ? `:${column}` : ""}`}`;
      const name = this.getFunctionName();
      if (this.isConstructor()) return `new ${name || "<anonymous>"} (${file})`;
      return name ? `${name} (${file})` : file;
    },
  });
}

// The timers are real. The pool sleeps until guest.timerDelay() and then calls guest.fireTimers().
{
  /** A timer that waits in the queue. */
  interface Timer {
    cb: (...args: unknown[]) => void;
    args: unknown[];
    wait: number;
    repeat: boolean;
    at: number;
  }
  const queue = new Map<number, Timer>();
  let seq = 0;
  const add =
    (repeat: boolean) =>
    (cb: Timer["cb"], delay = 0, ...args: unknown[]) => {
      const wait = Math.max(1, Number(delay) || 0);
      queue.set(++seq, { cb, args, wait, repeat, at: host.now() + wait });
      return seq;
    };
  const clear = (id: number) => void queue.delete(id);
  Object.assign(globalThis, {
    setTimeout: add(false),
    setInterval: add(true),
    clearTimeout: clear,
    clearInterval: clear,
  });
  Object.assign(guest, {
    timerDelay: () => {
      let next = Infinity;
      for (const t of queue.values()) next = Math.min(next, t.at);
      return next === Infinity ? -1 : Math.max(0, next - host.now());
    },
    fireTimers: () => {
      const now = host.now();
      let first: [number, Timer] | undefined;
      for (const entry of queue)
        if (entry[1].at <= now && (!first || entry[1].at < first[1].at)) first = entry;
      if (!first) return 0;
      const [id, t] = first;
      if (t.repeat) t.at = now + t.wait;
      else queue.delete(id);
      try {
        t.cb(...t.args);
      } catch (error) {
        const handlers = raw("uncaughtException");
        if (handlers.length === 0) throw error;
        for (const handler of handlers) handler(error);
      }
      return 1;
    },
  });
}

/** The signal of an `AbortController`. */
class InlineAbortSignal implements AbortSignal {
  aborted = false;
  reason: unknown;
  handlers: AbortListener[] = [];
  addEventListener(type: string, f: AbortListener) {
    if (type === "abort") this.handlers.push(f);
  }
  removeEventListener(_type: string, f: unknown) {
    this.handlers = this.handlers.filter((x) => x !== f);
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
}

/** The `AbortController` of vitest, which has none to read. */
export class AbortController {
  signal = new InlineAbortSignal();
  abort(reason: unknown = new Error("aborted")) {
    const s = this.signal;
    if (s.aborted) return;
    s.aborted = true;
    s.reason = reason;
    for (const f of s.handlers) f({ type: "abort" });
  }
}

// What vitest and the pool read in place of a global. The extensions define their globals before
// any script runs, so the ones that the option does not list are captured here and then removed.
export const URL = globalThis.URL;
export const TextDecoder = globalThis.TextDecoder;

for (const [extension, names] of Object.entries(internalExtensions)) {
  if (visible.has(extension)) continue;
  for (const name of names) Reflect.deleteProperty(globalThis, name);
}

// The thread records the rejections that nothing handles in host.rejections. The pool calls this after
// the pending jobs ran, so a handler that a job attaches in the same turn has removed its entry.
guest.flushRejections = () => {
  for (const key of Object.keys(host.rejections)) {
    const entry = host.rejections[key];
    delete host.rejections[key];
    if (entry) for (const f of raw("unhandledRejection")) f(entry.reason, entry.promise);
  }
};
