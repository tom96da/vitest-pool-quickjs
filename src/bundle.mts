// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";
import type { Plugin, PluginContext } from "rolldown";
import dedent from "ts-dedent";

import type { QuickJSPoolOptions } from "./types.mts";

/** The extension of the modules next to this file: `.mts` in the sources, `.js` in the build. */
const ext = import.meta.url.endsWith(".mts") ? ".mts" : ".js";

/**
 * Locates a module of the package by its name in the source tree. The build lays the modules out
 * the same way.
 * @param name - the name without the extension, such as `worker` or `shims/path`
 * @returns the URL of the module
 */
export const asset = (name: string): URL => new URL(`./${name}${ext}`, import.meta.url);

/**
 * Locates the module that replaces a `node:*` module.
 * @param name - the module name without the `node:` prefix
 * @returns the absolute file path
 */
const shim = (name: string): string => fileURLToPath(asset(`shims/${name}`));

/** The names of the built-ins that the package replaces with a module of its own. */
const shimNames = async (): Promise<Set<string>> =>
  new Set(
    (await readdir(new URL("./shims", import.meta.url)))
      .filter((file) => file.endsWith(ext))
      .map((file) => file.slice(0, -ext.length)),
  );

/**
 * Writes the source of a built-in that the package has no module for. The module has the export
 * names of the real one, and none of them does anything.
 * @param id - the module id, such as `node:fs`
 * @returns the source of the module
 */
async function inert(id: string): Promise<string> {
  const real = (await import(id)) as Record<string, unknown>;
  const names = Object.keys(real).filter(
    (name) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name),
  );
  const literal = (v: unknown): string =>
    typeof v === "function"
      ? "function () {}"
      : Array.isArray(v)
        ? "[]"
        : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? JSON.stringify(v)
          : "{}";
  const lines = names.map((name) => `export const ${name} = ${literal(real[name])};`);
  // the default export carries the same names, for code that reads them off `import x from`
  return dedent`
    ${lines.join("\n")}
    export default { ${names.join(", ")} };
  `;
}

/**
 * Serves the `node:*` modules: the source in `modules`, the modules of the package and, for any
 * other built-in, an inert module.
 * @param modules - the source of `node:*` modules by id
 * @param shims - the names of the built-ins that the package replaces
 * @returns the plugin
 */
function nodeModules(modules: Record<string, string>, shims: Set<string>): Plugin {
  const cache = new Map<string, Promise<string>>();
  return {
    name: "vitest-pool-quickjs:node-modules",
    resolveId(id) {
      if (!id.startsWith("node:")) return null;
      const name = id.slice("node:".length);
      return shims.has(name) && !(id in modules) ? shim(name) : `\0${id}`;
    },
    load(id) {
      if (!id.startsWith("\0node:")) return null;
      const key = id.slice(1);
      if (key in modules) return modules[key]!;
      if (!cache.has(key)) cache.set(key, inert(key));
      return cache.get(key)!;
    },
  };
}

/**
 * Serves `virtual:externals`: the listed modules, by specifier and by resolved path.
 * @param specifiers - the specifiers of the modules
 * @param root - the directory that the specifiers resolve from
 * @returns the plugin
 */
function externalModules(specifiers: string[], root: string): Plugin {
  const id = "\0virtual:externals";
  return {
    name: "vitest-pool-quickjs:externals",
    resolveId: (source) => (source === "virtual:externals" ? id : null),
    async load(this: PluginContext, loaded) {
      if (loaded !== id) return null;
      const imports: string[] = [];
      const entries: string[] = [];
      for (const [i, specifier] of specifiers.entries()) {
        const resolved = await this.resolve(specifier, path.join(root, "noop.mts"));
        // resolve from the project root: the generated module has no directory of its own
        const from = resolved && !resolved.id.startsWith("\0") ? resolved.id : specifier;
        imports.push(`import * as e${i} from ${JSON.stringify(from)};`);
        entries.push(`[${JSON.stringify(specifier)}, e${i}]`);
        if (resolved) entries.push(`[${JSON.stringify(resolved.id)}, e${i}]`);
      }
      return dedent`
        ${imports.join("\n")}
        export default Object.fromEntries([${entries.join(",")}]);
      `;
    },
  };
}

/**
 * Makes the module runner of vitest import externalized modules through
 * `globalThis.__externalImport`, since QuickJS has no `import()` of a file.
 */
const externalImport: Plugin = {
  name: "vitest-pool-quickjs:external-import",
  transform(code, id) {
    if (!id.endsWith("/vitest/dist/module-evaluator.js")) return null;
    const replaced = code.replace(": import(file)", ": globalThis.__externalImport(file)");
    if (replaced === code)
      this.error(
        "vitest changed how it imports externalized modules. " +
          "use a version of vitest that this package supports",
      );
    return replaced;
  },
};

/** The hook that the helper of vitest sets to read the stack of a new error without a source map. */
const stackHook = "Error.prepareStackTrace = (e) => e.stack;";

/**
 * Makes the plugin that turns that hook off. QuickJS has no `stack` yet while the hook runs, so the
 * hook returns nothing, and vitest finds no caller for `vi.mock`. Without the hook, the engine
 * gives the plain stack.
 * @returns the plugin
 */
function plainStack(): Plugin {
  let replaced = false;
  return {
    name: "vitest-pool-quickjs:plain-stack",
    transform(code) {
      if (!code.includes(stackHook)) return null;
      replaced = true;
      return code.replaceAll(stackHook, "Error.prepareStackTrace = undefined;");
    },
    buildEnd() {
      if (!replaced) {
        this.error(
          "vitest changed how it reads the plain stack. " +
            "use a version of vitest that this package supports",
        );
      }
    },
  };
}

/**
 * Bundles the worker into one script for a QuickJS context.
 * @param root - the directory that the `externals` resolve from
 * @param options - the externals, modules and plugins of the build; plugins run after the plugins
 * of the pool
 * @returns the source of the script
 */
export async function buildWorker(
  root: string,
  {
    externals = [],
    modules = {},
    plugins = [],
  }: Pick<QuickJSPoolOptions, "externals" | "modules" | "plugins">,
): Promise<string> {
  const shims = await shimNames();
  const build = await rolldown({
    input: fileURLToPath(asset("worker")),
    platform: "neutral",
    resolve: { conditionNames: ["import", "default"], mainFields: ["module", "main"] },
    checks: { bundlerTimings: false },
    // the optional environments of vitest (jsdom, happy-dom) are not installed and not used
    onLog() {},
    plugins: [
      externalModules(externals, root),
      nodeModules(modules, shims),
      externalImport,
      plainStack(),
      ...plugins,
    ],
  });
  const { output } = await build.generate({ format: "iife", codeSplitting: false });
  await build.close();
  return output[0].code;
}
