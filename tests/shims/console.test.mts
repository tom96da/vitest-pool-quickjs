// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:console", "node:stream"] };

const evaluate = (code: string) => evaluateWith(code, options);

it("writes the strings and numbers that log gets", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.log("count", 3);
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("writes the object that log gets", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.log("user", { id: 1, tags: ["a", "b"] });
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("fills the placeholders of log", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.log("%s is %d", "x", 5);
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("writes an empty line for log without arguments", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.log();
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("writes the object that dir gets", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.dir({ hello: "world" });
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it.each([
  { method: "log", argument: '"log"', stream: "output" },
  { method: "info", argument: '"info"', stream: "output" },
  { method: "debug", argument: '"debug"', stream: "output" },
  { method: "dir", argument: '{ hello: "world" }', stream: "output" },
  { method: "warn", argument: '"warn"', stream: "error" },
  { method: "error", argument: '"failed"', stream: "error" },
])("writes $method to the $stream stream", async ({ method, argument }) => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.${method}(${argument});
    export default { out, err };
  `);
  expect(shim).toEqual(await node);
});

it("indents what a group holds by two spaces", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.group("outer");
    console.log("inside");
    console.groupEnd();
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("indents a nested group by two more spaces", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.group("outer");
    console.group();
    console.log("inside");
    console.groupEnd();
    console.groupEnd();
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("indents every line of a message of several lines in a group", async () => {
  const message = `first line
second line`;
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.group();
    console.log(${JSON.stringify(message)});
    console.groupEnd();
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("stops the indent at groupEnd", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.group("outer");
    console.groupEnd();
    console.log("after");
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("counts by label", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.count();
    console.count();
    console.count("label");
    export default out;
  `);
  expect(shim).toEqual(await node);
});

it("starts the count again after countReset", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Console } from "node:console";
    import { Writable } from "node:stream";
    const out = [];
    const err = [];
    const sink = (chunks) =>
      new Writable({
        write(data, encoding, callback) {
          chunks.push(String(data));
          callback();
        },
      });
    const console = new Console({ stdout: sink(out), stderr: sink(err), groupIndentation: 2 });
    console.count();
    console.count();
    console.countReset();
    console.count();
    export default out;
  `);
  expect(shim).toEqual(await node);
});
