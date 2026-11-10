// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that vitest reads while it loads and that QuickJS lacks. This module runs first in
// the worker bundle.

/** A listener of a process event. */
type Listener = (...args: unknown[]) => void;

/** The members of `process` that vitest reads. */
interface Process {
  env: Record<string, string>;
  argv: string[];
  platform: string;
  versions: Record<string, string>;
  cwd(): string;
  nextTick(f: () => void): void;
  emitWarning(): void;
  listeners(name: string): Listener[];
  on(name: string, f: Listener): Process;
  once(name: string, f: Listener): Process;
  off(name: string, f: Listener): Process;
  removeListener(name: string, f: Listener): Process;
  removeAllListeners(): Process;
  memoryUsage(): { heapUsed: number };
  exit(): never;
  hrtime: { (): [number, number]; bigint(): bigint };
  stdout: { write(text: string, callback?: () => void): boolean };
  stderr: { write(text: string, callback?: () => void): boolean };
}

/** The listeners of `process`, by event name. */
const listeners = new Map<string, Listener[]>();
const on = (name: string, f: Listener): Process => {
  listeners.set(name, [...(listeners.get(name) ?? []), f]);
  return proc;
};
const off = (name: string, f: Listener): Process => {
  listeners.set(
    name,
    (listeners.get(name) ?? []).filter((x) => x !== f),
  );
  return proc;
};
/** The `process` of the context. */
const proc: Process = {
  env: {},
  argv: [],
  platform: "quickjs",
  versions: {},
  cwd: () => "/",
  nextTick: (f) => void Promise.resolve().then(f),
  emitWarning() {},
  listeners: (name) => [...(listeners.get(name) ?? [])],
  on,
  once: on,
  off,
  removeListener: off,
  removeAllListeners() {
    listeners.clear();
    return proc;
  },
  memoryUsage: () => ({ heapUsed: 0 }),
  exit() {
    throw new Error("process.exit");
  },
  hrtime: Object.assign((): [number, number] => [0, 0], {
    bigint: () => BigInt(Math.round(__now() * 1e6)),
  }),
  stdout: { write: (text, callback) => (__stdout(String(text)), callback?.(), true) },
  stderr: { write: (text, callback) => (__stderr(String(text)), callback?.(), true) },
};

Object.assign(globalThis, {
  process: proc,
  EventTarget: class {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
  },
  Event: class {},
  TextDecoder: class {
    decode() {
      return "";
    }
  },
});
if (!("console" in globalThis)) Object.assign(globalThis, { console: {} });
// vitest swaps Error.prepareStackTrace, a V8 hook. QuickJS builds `stack` itself and loses it then.
Object.defineProperty(Error, "prepareStackTrace", {
  get: () => undefined,
  set() {},
  configurable: true,
});

// Real timers: the pool sleeps until __timerDelay() and then calls __fireTimers().
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
      queue.set(++seq, { cb, args, wait, repeat, at: __now() + wait });
      return seq;
    };
  const clear = (id: number) => void queue.delete(id);
  Object.assign(globalThis, {
    setTimeout: add(false),
    setInterval: add(true),
    clearTimeout: clear,
    clearInterval: clear,
    performance: { now: () => __now(), timeOrigin: Date.now() - __now() },
    __timerDelay: () => {
      let next = Infinity;
      for (const t of queue.values()) next = Math.min(next, t.at);
      return next === Infinity ? -1 : Math.max(0, next - __now());
    },
    // runs the earliest due timer and returns 1, or returns 0 when none is due
    __fireTimers: () => {
      const now = __now();
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
        const handlers = proc.listeners("uncaughtException");
        if (handlers.length === 0) throw error;
        for (const handler of handlers) handler(error);
      }
      return 1;
    },
  });
}

/** The signal of an `AbortController`. */
class InlineAbortSignal {
  aborted = false;
  reason: unknown;
  handlers: ((e: { type: string }) => void)[] = [];
  addEventListener(_type: string, f: (e: { type: string }) => void) {
    this.handlers.push(f);
  }
  removeEventListener(_type: string, f: unknown) {
    this.handlers = this.handlers.filter((x) => x !== f);
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
}

/** An `AbortController` for the context, which has none. */
class InlineAbortController {
  signal = new InlineAbortSignal();
  abort(reason: unknown = new Error("aborted")) {
    const s = this.signal;
    if (s.aborted) return;
    s.aborted = true;
    s.reason = reason;
    for (const f of s.handlers) f({ type: "abort" });
  }
}
if (!("AbortController" in globalThis)) {
  Object.assign(globalThis, { AbortController: InlineAbortController });
}

/**
 * The `URLSearchParams` of the context, which has none. It parses and writes plain `key=value`
 * pairs.
 */
class InlineSearchParams {
  pairs: [string, string][] = [];
  constructor(query = "") {
    for (const kv of String(query).replace(/^\?/, "").split("&").filter(Boolean)) {
      const [k = "", v = ""] = kv.split("=");
      this.pairs.push([decodeURIComponent(k), decodeURIComponent(v)]);
    }
  }
  get(k: string) {
    return this.pairs.find((e) => e[0] === k)?.[1] ?? null;
  }
  has(k: string) {
    return this.pairs.some((e) => e[0] === k);
  }
  append(k: string, v: unknown) {
    this.pairs.push([k, String(v)]);
  }
  delete(k: string) {
    this.pairs = this.pairs.filter((e) => e[0] !== k);
  }
  toString() {
    return this.pairs
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }
}

/**
 * The `URL` of the context, which has none. It splits an absolute URL into its parts and resolves
 * a relative one against a base. It does not parse userinfo, ports or IDNA.
 */
class InlineURL {
  protocol = "";
  host = "";
  hostname = "";
  pathname = "";
  search = "";
  hash = "";
  origin = "null";
  searchParams = new InlineSearchParams();
  constructor(input: unknown, base?: unknown) {
    const text = String(input);
    const m = /^([a-zA-Z][\w+.-]*:)(\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/.exec(text);
    if (!m) {
      if (base === undefined) throw new TypeError(`invalid URL. got ${JSON.stringify(text)}`);
      const b = new InlineURL(base);
      return new InlineURL(
        text.startsWith("/") ? b.origin + text : b.href.replace(/[^/]*$/, "") + text,
      );
    }
    this.protocol = m[1]!;
    this.host = this.hostname = m[3] ?? "";
    this.pathname = m[4] || (m[2] ? "/" : "");
    this.search = m[5] ?? "";
    this.hash = m[6] ?? "";
    this.searchParams = new InlineSearchParams(this.search);
    if (m[2]) this.origin = `${this.protocol}//${this.host}`;
  }
  get href() {
    const slashes = this.host || this.protocol === "file:" ? `//${this.host}` : "";
    return this.protocol + slashes + this.pathname + this.search + this.hash;
  }
  toString() {
    return this.href;
  }
  toJSON() {
    return this.href;
  }
}
if (!("URLSearchParams" in globalThis)) {
  Object.assign(globalThis, { URLSearchParams: InlineSearchParams });
}
if (!("URL" in globalThis)) Object.assign(globalThis, { URL: InlineURL });

// QuickJS reports no unhandled rejection to JS, so promises are watched through then and reject.
// `await` skips then for a promise whose constructor is Promise. A watched promise has a
// constructor of its own, so that `await` calls then and marks the promise as handled. The
// rejection of an async function nobody awaits is not seen.
{
  const handled = new WeakSet<object>();
  const rejected = new Map<object, unknown>();
  const nativeThen = Reflect.get(Promise.prototype, "then") as Promise<unknown>["then"];
  const nativeReject = Reflect.get(Promise, "reject") as (reason: unknown) => Promise<unknown>;
  const awaitable = function WatchedPromise() {};
  const watch = (promise: Promise<unknown>) => {
    void Object.defineProperty(promise, "constructor", { value: awaitable, configurable: true });
    void nativeThen.call(promise, undefined, (reason: unknown) => {
      if (!handled.has(promise)) rejected.set(promise, reason);
    });
  };
  Reflect.set(Promise.prototype, "then", function (this: Promise<unknown>, ok: never, bad: never) {
    handled.add(this);
    rejected.delete(this);
    const next = nativeThen.call(this, ok, bad);
    watch(next);
    return next;
  });
  Promise.reject = function (this: unknown, reason: unknown) {
    const promise = nativeReject.call(this, reason);
    watch(promise);
    return promise;
  } as typeof Promise.reject;
  Object.assign(globalThis, {
    __flushRejections: () => {
      const reasons = [...rejected.values()];
      rejected.clear();
      for (const reason of reasons) for (const f of proc.listeners("unhandledRejection")) f(reason);
    },
  });
}
