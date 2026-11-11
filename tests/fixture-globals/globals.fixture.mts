// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it, vi } from "vitest";

describe("URL", () => {
  it("splits an absolute URL into its parts", () => {
    const url = new URL("https://example.com/a/b?x=1#top");
    expect(url).toMatchObject({
      protocol: "https:",
      host: "example.com",
      hostname: "example.com",
      pathname: "/a/b",
      search: "?x=1",
      hash: "#top",
      origin: "https://example.com",
      href: "https://example.com/a/b?x=1#top",
    });
  });

  it("gives a URL with a host and no path the path /", () => {
    expect(new URL("http://example.com").pathname).toBe("/");
    expect(new URL("http://example.com").href).toBe("http://example.com/");
  });

  it("keeps a URL without a host as it is", () => {
    const url = new URL("mailto:a@example.com");
    expect(url.pathname).toBe("a@example.com");
    expect(url.href).toBe("mailto:a@example.com");
  });

  it("gives a URL without a host the origin null", () => {
    expect(new URL("mailto:a@example.com").origin).toBe("null");
  });

  it("writes the empty host of a file URL as two slashes", () => {
    expect(new URL("file:///a/b.ts").href).toBe("file:///a/b.ts");
  });

  it("resolves an absolute path against the origin of the base", () => {
    expect(new URL("/x?y=1", "http://h/a/b").href).toBe("http://h/x?y=1");
  });

  it("resolves a relative path against the directory of the base", () => {
    expect(new URL("x", "http://h/a/b?q#f").href).toBe("http://h/a/x");
  });

  it("throws a TypeError for a relative URL without a base", () => {
    expect(() => new URL("/x")).toThrow(TypeError);
  });

  it("converts to a string as the href", () => {
    expect(String(new URL("http://h/p?q=1"))).toBe("http://h/p?q=1");
  });

  it("converts to JSON as the href", () => {
    const url = new URL("http://h/p?q=1");
    expect(JSON.stringify({ url })).toBe('{"url":"http://h/p?q=1"}');
  });

  it("resolves a path that starts with two slashes against the protocol of the base", () => {
    expect(new URL("//other/p", "https://h/a").href).toBe("https://other/p");
  });

  it("throws a TypeError for a relative base", () => {
    expect(() => new URL("x", "relative-base")).toThrow(TypeError);
  });

  it("reads the search parameters from the query", () => {
    expect(new URL("http://h/p?a=1&b=2").searchParams.get("b")).toBe("2");
  });
});

describe("URLSearchParams", () => {
  it("drops a leading question mark", () => {
    expect(new URLSearchParams("?a=1").toString()).toBe("a=1");
  });

  it("drops empty pairs", () => {
    expect(new URLSearchParams("a=1&&b=2&").toString()).toBe("a=1&b=2");
  });

  it("reads + as a space", () => {
    expect(new URLSearchParams("a+b=c+d").get("a b")).toBe("c d");
  });

  it("decodes percent escapes of keys and values", () => {
    expect(new URLSearchParams("a%20b=c%26d").get("a b")).toBe("c&d");
  });

  it("reads a key without = as an empty value", () => {
    expect(new URLSearchParams("a").get("a")).toBe("");
  });

  it("keeps everything after the first = in the value", () => {
    expect(new URLSearchParams("token=YWJj==").get("token")).toBe("YWJj==");
  });

  it("returns the first value of a repeated key", () => {
    expect(new URLSearchParams("a=1&a=2").get("a")).toBe("1");
  });

  it("returns null for a missing key", () => {
    expect(new URLSearchParams("a=1").get("b")).toBeNull();
  });

  it("tells whether a key is there", () => {
    const params = new URLSearchParams("a=1");
    expect(params.has("a")).toBe(true);
    expect(params.has("b")).toBe(false);
  });

  it("appends a value as a string", () => {
    const params = new URLSearchParams();
    params.append("n", 1 as unknown as string);
    expect(params.get("n")).toBe("1");
  });

  it("encodes the keys and values when written", () => {
    const params = new URLSearchParams();
    params.append("k y", "a&b");
    expect(params.toString()).toBe("k+y=a%26b");
  });

  it("writes !'()~ as escapes and leaves *-._ as they are", () => {
    const params = new URLSearchParams();
    params.append("k", "!'()~*-._");
    expect(params.toString()).toBe("k=%21%27%28%29%7E*-._");
  });

  it("keeps a lone % as it is", () => {
    expect(new URLSearchParams("a=100%").get("a")).toBe("100%");
  });

  it("decodes an invalid byte of an escape as U+FFFD", () => {
    expect(new URLSearchParams("a=%FFb").get("a")).toBe("\ufffdb");
  });

  it.each([
    ["an invalid escape", "a=%zz", "%zz"],
    ["a truncated escape", "a=%4", "%4"],
    ["a valid and an invalid byte", "a=%C3%A9%FF", "\u00e9\ufffd"],
    ["an escaped plus", "a=%2B", "+"],
    ["a plus", "a=b+c", "b c"],
    ["an astral character", "a=%F0%9F%98%80", "\u{1f600}"],
    ["a BOM", "a=%EF%BB%BFx", "\ufeffx"],
    ["a BOM inside a value", "a=y%EF%BB%BFx", "y\ufeffx"],
  ])("decodes %s", (_name, query, expected) => {
    expect(new URLSearchParams(query).get("a")).toBe(expected);
  });

  it.each([
    ["a lone high surrogate at the end", "a\ud800", "a%EF%BF%BD"],
    ["a lone low surrogate at the start", "\udc00x", "%EF%BF%BDx"],
    ["a high surrogate before a high surrogate", "\ud800\ud800", "%EF%BF%BD%EF%BF%BD"],
    ["a low surrogate before a high surrogate", "\udc00\ud800", "%EF%BF%BD%EF%BF%BD"],
    ["a lone high surrogate before a pair", "\ud800\u{1f600}", "%EF%BF%BD%F0%9F%98%80"],
  ])("writes %s as U+FFFD", (_name, value, expected) => {
    const params = new URLSearchParams();
    params.append("a", value);
    expect(params.toString()).toBe(`a=${expected}`);
  });

  it("writes a surrogate pair as one character", () => {
    const params = new URLSearchParams();
    params.append("a", "\u{1f600}");
    expect(params.toString()).toBe("a=%F0%9F%98%80");
  });

  it("deletes every pair of a key", () => {
    const params = new URLSearchParams("a=1&b=2&a=3");
    params.delete("a");
    expect(params.toString()).toBe("b=2");
  });
});

describe("AbortController", () => {
  it("starts with a signal that is not aborted", () => {
    expect(new AbortController().signal.aborted).toBe(false);
  });

  it("aborts with an Error as the default reason", () => {
    const controller = new AbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBeInstanceOf(Error);
  });

  it("aborts with the given reason", () => {
    const controller = new AbortController();
    controller.abort("stop");
    expect(controller.signal.reason).toBe("stop");
  });

  it("calls the listeners with an abort event", () => {
    const controller = new AbortController();
    const listener = vi.fn<() => void>();
    controller.signal.addEventListener("abort", listener);
    controller.abort();
    expect(listener).toHaveBeenCalledWith({ type: "abort" });
  });

  it("aborts once and keeps the first reason", () => {
    const controller = new AbortController();
    const listener = vi.fn<() => void>();
    controller.signal.addEventListener("abort", listener);
    controller.abort("first");
    controller.abort("second");
    expect(listener).toHaveBeenCalledOnce();
    expect(controller.signal.reason).toBe("first");
  });

  it("does not call a listener of another event type", () => {
    const controller = new AbortController();
    const listener = vi.fn<() => void>();
    controller.signal.addEventListener("other", listener);
    controller.abort();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not call a listener that was removed", () => {
    const controller = new AbortController();
    const listener = vi.fn<() => void>();
    controller.signal.addEventListener("abort", listener);
    controller.signal.removeEventListener("abort", listener);
    controller.abort();
    expect(listener).not.toHaveBeenCalled();
  });

  it("throws the reason from throwIfAborted once aborted", () => {
    const controller = new AbortController();
    expect(() => controller.signal.throwIfAborted()).not.toThrow();
    controller.abort("stop");
    expect(() => controller.signal.throwIfAborted()).toThrow("stop");
  });
});

describe("FinalizationRegistry", () => {
  /** Builds a registry and a target that both become garbage in one cycle. */
  const drop = () => {
    const registry = new FinalizationRegistry(() => {});
    const target: { self?: object } = {};
    target.self = target;
    registry.register(target, 1);
    const holder: { registry: object; self?: object } = { registry };
    holder.self = holder;
  };

  it("survives a registry that is collected with its target", async () => {
    drop();
    drop();
    // allocating cycles runs the cycle collector
    for (let i = 0; i < 100_000; i++) {
      const a: { self?: object } = {};
      a.self = a;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(new FinalizationRegistry(() => {})).toBeInstanceOf(FinalizationRegistry);
  });
});
