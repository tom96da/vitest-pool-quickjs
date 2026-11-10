// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { decode, encode } from "../src/worker/codec.mts";

/**
 * Sends a value through the codec.
 * @param value - the value to send
 * @returns the value that arrives
 */
const roundTrip = (value: unknown): unknown => decode(encode(value));

describe.concurrent("codec", () => {
  it("keeps a regular expression with its flags", () => {
    const back = roundTrip(/foo.*/gi) as RegExp;
    expect(back).toBeInstanceOf(RegExp);
    expect(back.source).toBe("foo.*");
    expect(back.flags).toBe("gi");
  });

  it("keeps a map whose keys are objects", () => {
    const back = roundTrip(new Map([[{ id: 1 }, { n: 2 }]])) as Map<unknown, unknown>;
    expect(back).toBeInstanceOf(Map);
    expect([...back]).toEqual([[{ id: 1 }, { n: 2 }]]);
  });

  it("keeps a set of mixed values", () => {
    const back = roundTrip(new Set([1, "a", { b: 2 }])) as Set<unknown>;
    expect(back).toBeInstanceOf(Set);
    expect([...back]).toEqual([1, "a", { b: 2 }]);
  });

  it("keeps a valid date", () => {
    expect((roundTrip(new Date(1_700_000_000_000)) as Date).getTime()).toBe(1_700_000_000_000);
  });

  it("keeps an invalid date invalid", () => {
    expect(Number.isNaN((roundTrip(new Date(Number.NaN)) as Date).getTime())).toBe(true);
  });

  it("keeps numbers that are not finite", () => {
    const back = roundTrip([Number.NaN, Infinity, -Infinity]) as number[];
    expect(back[0]).toBeNaN();
    expect(back.slice(1)).toEqual([Infinity, -Infinity]);
  });

  it("keeps an undefined value", () => {
    expect(roundTrip({ a: undefined })).toEqual({ a: undefined });
  });

  it("keeps a bigint value", () => {
    expect(roundTrip(10n)).toBe(10n);
  });

  it("turns values that cannot be sent into null", () => {
    expect(roundTrip([() => {}, Symbol("s")])).toEqual([null, null]);
  });

  it("keeps two references to one object as one object", () => {
    const shared = { x: 1 };
    const back = roundTrip({ a: shared, b: shared }) as { a: unknown; b: unknown };
    expect(back.a).toBe(back.b);
  });

  it("keeps a cycle through an object", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const back = roundTrip(cycle) as typeof cycle;
    expect(back.self).toBe(back);
  });

  it("keeps a cycle through a map", () => {
    const map = new Map<string, unknown>();
    map.set("me", map);
    const back = roundTrip(map) as Map<string, unknown>;
    expect(back.get("me")).toBe(back);
  });

  it("keeps the name, message and stack of an error", () => {
    const error = new TypeError("boom");
    const back = roundTrip(error) as Error;
    expect(back.name).toBe("TypeError");
    expect(back.message).toBe("boom");
    expect(back.stack).toBe(error.stack);
  });

  it("keeps the own fields of an error", () => {
    const error = Object.assign(new Error("boom"), { code: "E_BOOM" });
    expect((roundTrip(error) as { code: string }).code).toBe("E_BOOM");
  });
});
