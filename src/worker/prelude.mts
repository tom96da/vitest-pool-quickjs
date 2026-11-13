// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The globals that vitest reads while it loads and that QuickJS lacks. This module runs first in
// the worker bundle.

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
  env: {},
  argv: [],
  platform: "quickjs",
  versions: {},
  cwd: () => "/",
  nextTick: (f) => queueMicrotask(f),
  emitWarning() {},
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

/** An `AbortController` for the context, which has none. */
class InlineAbortController implements InstanceType<typeof AbortController> {
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

// an invalid sequence of escapes becomes U+FFFD, and a lone % stays as it is
const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });
const decode = (text: string) =>
  text
    .replace(/\+/g, " ")
    .replace(/(?:%[0-9a-f]{2})+/gi, (run) =>
      utf8.decode(Uint8Array.from(run.slice(1).split("%"), (hex) => parseInt(hex, 16))),
    );

const encode = (text: string) =>
  encodeURIComponent(
    text.replace(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
      "\ufffd",
    ),
  )
    .replace(/%20/g, "+")
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The `URLSearchParams` of the context, which has none. It parses and writes plain `key=value`
 * pairs and reads `+` as a space.
 */
class InlineSearchParams implements URLSearchParams {
  pairs: [string, string][] = [];
  constructor(query = "") {
    for (const kv of String(query).replace(/^\?/, "").split("&").filter(Boolean)) {
      const eq = kv.indexOf("=");
      const [k, v] = eq < 0 ? [kv, ""] : [kv.slice(0, eq), kv.slice(eq + 1)];
      this.pairs.push([decode(k), decode(v)]);
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
    return this.pairs.map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
  }
}

/**
 * The `URL` of the context, which has none. It splits an absolute URL into its parts and resolves
 * a relative one against a base. It does not parse userinfo, ports or IDNA.
 */
class InlineURL implements URL {
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
        text.startsWith("//")
          ? b.protocol + text
          : text.startsWith("/")
            ? b.origin + text
            : b.href.replace(/[^/]*$/, "") + text,
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

// The thread records the rejections that nothing handles in __rejections. The pool calls this after
// the pending jobs ran, so a handler that a job attaches in the same turn has removed its entry.
Object.assign(globalThis, {
  __flushRejections: () => {
    for (const key of Object.keys(__rejections)) {
      const entry = __rejections[key];
      delete __rejections[key];
      if (entry) for (const f of raw("unhandledRejection")) f(entry.reason, entry.promise);
    }
  },
});
