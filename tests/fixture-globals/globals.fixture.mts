// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("a global of an extension that the option does not list", () => {
  it.each(["structuredClone", "crypto", "Headers"])("leaves %s undefined", (name) => {
    expect(name in globalThis).toBe(false);
  });
});

describe("a global that the pool hides", () => {
  it.each([
    "EventTarget",
    "Event",
    "AbortController",
    "URL",
    "URLSearchParams",
    "TextDecoder",
    "TextEncoder",
  ])("leaves %s undefined", (name) => {
    expect(name in globalThis).toBe(false);
  });

  it.each([
    "__host",
    "__guest",
    "__env",
    "__now",
    "__stdout",
    "__stderr",
    "__post",
    "__gc",
    "__rejections",
    "__onMessage",
    "__externalImport",
    "__timerDelay",
    "__fireTimers",
    "__flushRejections",
    "__evalFile",
    "__evalResult",
    "__readFile",
    "__writeFile",
    "__removeFile",
  ])("leaves the helper %s undefined", (name) => {
    expect(name in globalThis).toBe(false);
  });
});

describe("a global that the pool leaves", () => {
  it.each(["process", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "performance"])(
    "has %s",
    (name) => {
      expect(name in globalThis).toBe(true);
    },
  );
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

describe("recursion", () => {
  it("throws a RangeError that the code can catch", () => {
    const f = (): void => f();
    expect(f).toThrow(RangeError);
  });
});
