// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EvalFlags, QuickJS } from "quickjs-wasi";
import type { HostFunction } from "quickjs-wasi";
import { inject } from "vitest";

import type { Extension } from "../../src/extensions.mts";
import { compile } from "../../src/pool.mts";

/** A QuickJS context that serves built shims to the modules it evaluates. */
export interface Engine {
  /** Evaluates an ES module and returns its default export, as JSON data. */
  run: (code: string) => Promise<unknown>;
  vm: QuickJS;
}

/** What a test gives the context beyond the shim. */
export interface LoadOptions {
  /** The extensions of quickjs-wasi that the context loads. */
  extensions?: Extension[];
  /** Makes the functions of `__host`, for a shim that imports the host module. */
  host?: (vm: QuickJS) => Record<string, HostFunction>;
  /** The specifiers, such as `node:path`, that a module of the context can import as a built shim. */
  modules?: string[];
}

/**
 * Starts a context whose modules can import the built shims.
 * @param options - the extensions, the host and the module specifiers of the context
 */
export async function load({
  extensions = [],
  host,
  modules = [],
}: LoadOptions = {}): Promise<Engine> {
  const sources: Record<string, string> = {};
  for (const specifier of modules) sources[specifier] = inject("modules")[specifier]!;
  const vm = await QuickJS.create({
    moduleLoader: { load: (module: string) => sources[module]! },
    wasm: await compile("quickjs-wasi/quickjs.wasm"),
    extensions: await Promise.all(
      extensions.map(async (n) => ({ name: n, wasm: await compile(`quickjs-wasi/${n}.so`) })),
    ),
  });
  if (host) {
    const object = vm.newObject();
    for (const [key, fn] of Object.entries(host(vm)))
      vm.setProp(object, key, vm.newFunction(key, fn));
    vm.setProp(vm.global, "__host", object);
  }
  // the prelude gives the context a process, which the formatter of vitest reads while it loads
  vm.evalCode("globalThis.process = { env: {} };", "process.js");
  const run = async (code: string): Promise<unknown> => {
    sources["test:main"] = code;
    const pending = vm.resolvePromise(
      vm.evalCode(
        'import result from "test:main"; globalThis.result = result;',
        "test.mjs",
        EvalFlags.TYPE_MODULE,
      ),
    );
    // a module with a top-level await settles when the jobs have run
    while (vm.executePendingJobs() > 0);
    const settled = await pending;
    if ("error" in settled) {
      throw new Error(`the module failed in QuickJS: ${JSON.stringify(vm.dump(settled.error))}`);
    }
    settled.value.dispose();
    return vm.dump(vm.evalCode("globalThis.result"));
  };
  return { vm, run };
}

/**
 * Evaluates an ES module in a new context, and in Node when `node` is read.
 * Node resolves the specifiers of the module itself, so a shim is compared with the real module.
 * The result of Node is read only by the test that compares, because Node may differ or throw.
 * @param code - the text of the module, which imports a shim by its specifier such as `node:path`
 * @param options - the module specifiers, the extensions and the host of the context
 * @returns the default export of the module in the context, and a promise of its default export in Node
 */
export async function evaluate(
  code: string,
  options: LoadOptions,
): Promise<{ shim: unknown; node: Promise<unknown> }> {
  const { run } = await load(options);
  let node: Promise<unknown> | undefined;
  return {
    shim: await run(code),
    get node() {
      return (node ??= import(`data:text/javascript,${encodeURIComponent(code)}`).then(
        (module) => module.default,
      ));
    },
  };
}
