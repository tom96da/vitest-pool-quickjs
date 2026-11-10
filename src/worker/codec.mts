// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// JSON that survives the reference cycles of the task objects of vitest. Both ends of the pool
// channel use it. Shared objects stay shared.

/** A value that has a node of its own in the encoded graph. */
type Tagged =
  | { $d: number | null }
  | { $r: string; f: string }
  | { $m: [unknown, unknown][] }
  | { $s: unknown[] };

/** A node of the encoded graph: an object, an array or a tagged value. */
type Node = Record<string, unknown> | unknown[] | Tagged;

/**
 * Encodes a value into text that `decode` turns back. A function and a symbol become `null`, and
 * a typed array becomes an empty object. Objects, arrays, dates, regular expressions, maps, sets,
 * bigints, strings, numbers and booleans round-trip.
 * @param root - the value to encode
 * @returns the text
 */
export function encode(root: unknown): string {
  const ids = new Map<object, number>();
  const nodes: Node[] = [];
  const enc = (v: unknown): unknown => {
    if (typeof v === "function" || typeof v === "symbol") return null;
    if (typeof v === "bigint") return { $b: String(v) };
    if (typeof v === "number" && !Number.isFinite(v)) return { $n: String(v) };
    if (v === undefined) return { $u: 1 };
    if (typeof v !== "object" || v === null) return v;
    const known = ids.get(v);
    if (known !== undefined) return { $: known };
    const id = nodes.length;
    ids.set(v, id);
    nodes.push([]);
    if (v instanceof Date) nodes[id] = { $d: Number.isNaN(v.getTime()) ? null : v.getTime() };
    else if (v instanceof RegExp) nodes[id] = { $r: v.source, f: v.flags };
    else if (v instanceof Map) nodes[id] = { $m: Array.from(v, ([k, x]) => [enc(k), enc(x)]) };
    else if (v instanceof Set) nodes[id] = { $s: Array.from(v, enc) };
    else if (Array.isArray(v)) nodes[id] = v.map(enc);
    else {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      // the own keys of an Error leave out its name, message and stack
      if (v instanceof Error) {
        for (const k of ["name", "message", "stack"] as const) out[k] = enc(v[k]);
      }
      for (const k of Object.keys(src)) out[k] = enc(src[k]);
      nodes[id] = out;
    }
    return { $: id };
  };
  return JSON.stringify({ r: enc(root), n: nodes });
}

/**
 * Decodes the text that `encode` made.
 * @param text - the text from `encode`
 * @returns the value, with the same shared references and cycles
 */
export function decode(text: string): unknown {
  const { r, n } = JSON.parse(text) as { r: unknown; n: Node[] };
  const made: unknown[] = [];
  const dec = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    const tag = v as { $?: number; $u?: 1; $b?: string; $n?: string };
    if (tag.$u) return undefined;
    if (tag.$b !== undefined) return BigInt(tag.$b);
    if (tag.$n !== undefined) return Number(tag.$n);
    const id = tag.$!;
    if (id in made) return made[id];
    const node = n[id]!;
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      made[id] = out;
      for (const item of node) out.push(dec(item));
      return out;
    }
    const tagged = node as Tagged;
    if ("$d" in tagged) return (made[id] = new Date(tagged.$d ?? Number.NaN));
    if ("$r" in tagged) return (made[id] = new RegExp(tagged.$r, tagged.f));
    if ("$m" in tagged) {
      const out = new Map<unknown, unknown>();
      made[id] = out;
      for (const [k, x] of tagged.$m) out.set(dec(k), dec(x));
      return out;
    }
    if ("$s" in tagged) {
      const out = new Set<unknown>();
      made[id] = out;
      for (const x of tagged.$s) out.add(dec(x));
      return out;
    }
    const out: Record<string, unknown> = {};
    made[id] = out;
    for (const k of Object.keys(node)) out[k] = dec((node as Record<string, unknown>)[k]);
    return out;
  };
  return dec(r);
}
