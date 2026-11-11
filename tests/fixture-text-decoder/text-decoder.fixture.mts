// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

const decode = (...bytes: number[]) => new TextDecoder().decode(new Uint8Array(bytes));

/** A SharedArrayBuffer that holds the UTF-8 bytes of "a\u00e9". */
function sharedBytes(): SharedArrayBuffer {
  const sab = new SharedArrayBuffer(3);
  new Uint8Array(sab).set([0x61, 0xc3, 0xa9]);
  return sab;
}

describe("TextDecoder", () => {
  it.each([
    ["1 byte", [0x61], "a"],
    ["2 bytes", [0xc3, 0xa9], "\u00e9"],
    ["3 bytes", [0xe2, 0x82, 0xac], "\u20ac"],
    ["4 bytes", [0xf0, 0x9f, 0x98, 0x80], "\u{1f600}"],
    ["a lone invalid byte", [0x61, 0x80, 0x62], "a\ufffdb"],
    ["a truncated sequence", [0x61, 0xe2, 0x82], "a\ufffd"],
    ["a 0xff lead byte", [0xff], "\ufffd"],
    ["a 0xf8 lead byte", [0xf8, 0x88, 0x80, 0x80, 0x80], "\ufffd\ufffd\ufffd\ufffd\ufffd"],
    ["an overlong form", [0xe0, 0x80, 0x80], "\ufffd\ufffd\ufffd"],
    ["a surrogate", [0xed, 0xa0, 0x80], "\ufffd\ufffd\ufffd"],
    ["a NUL byte", [0x61, 0x00, 0x62], "a\0b"],
    ["a NUL byte at the start", [0x00, 0x61], "\0a"],
    ["a NUL byte at the end", [0x61, 0x00], "a\0"],
    ["a leading BOM", [0xef, 0xbb, 0xbf, 0x61], "a"],
    ["a BOM only", [0xef, 0xbb, 0xbf], ""],
    ["two leading BOMs", [0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x61], "\ufeffa"],
    ["a BOM after text", [0x61, 0xef, 0xbb, 0xbf], "a\ufeff"],
  ])("decodes %s", (_name, bytes, expected) => {
    expect(decode(...bytes)).toBe(expected);
  });

  it("decodes nothing for no argument", () => {
    expect(new TextDecoder().decode()).toBe("");
  });

  it("decodes nothing for an empty buffer", () => {
    expect(decode()).toBe("");
  });

  it.each([
    ["an ArrayBuffer", () => new Uint8Array([0x61, 0xc3, 0xa9]).buffer],
    ["a view with an offset", () => new Uint8Array([0x78, 0x61, 0xc3, 0xa9, 0x78]).subarray(1, 4)],
    ["a view of a SharedArrayBuffer", () => new Uint8Array(sharedBytes())],
    ["a SharedArrayBuffer", sharedBytes],
    ["a DataView", () => new DataView(new Uint8Array([0x78, 0x61, 0xc3, 0xa9]).buffer, 1)],
  ])("decodes %s", (_name, make) => {
    expect(new TextDecoder().decode(make())).toBe("a\u00e9");
  });
});
