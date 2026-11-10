// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";
import type { Plugin, PluginContext } from "rolldown";
import dedent from "ts-dedent";

/** What the worker bundle is built from. */
export interface BuildOptions {
  /** Directory that the `externals` resolve from. */
  root: string;
  /** Specifiers of the modules that the worker can import beyond the ones vitest inlines. */
  externals: string[];
  /** Source of `node:*` modules by id. It wins over the modules that the pool provides. */
  modules: Record<string, string>;
  /** Rolldown plugins that run after the plugins of the pool. */
  plugins: Plugin[];
}

/**
 * Resolves a path against the directory of the built package.
 * @param relative - a path relative to this file
 * @returns the absolute file path
 */
const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** The built entry of the worker. */
const workerEntry = (): string => here("./worker.js");

/**
 * Locates the built module that replaces a `node:*` module.
 * @param name - the module name without the `node:` prefix
 * @returns the absolute file path
 */
const shim = (name: string): string => here(`./shims/${name}.js`);

/** The names of the built-ins that the package replaces with a module of its own. */
const shimNames = async (): Promise<Set<string>> =>
  new Set((await readdir(here("./shims"))).map((file) => file.replace(/\.js$/, "")));

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
      ? "() => {}"
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
        imports.push(`import * as e${i} from ${JSON.stringify(specifier)};`);
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

/**
 * Bundles the worker into one script for a QuickJS context.
 * @param options - the modules, scripts and plugins of the build
 * @returns the source of the script
 */
export async function buildWorker(options: BuildOptions): Promise<string> {
  const shims = await shimNames();
  const build = await rolldown({
    input: workerEntry(),
    platform: "neutral",
    resolve: { conditionNames: ["import", "default"], mainFields: ["module", "main"] },
    checks: { bundlerTimings: false },
    // the optional environments of vitest (jsdom, happy-dom) are not installed and not used
    onLog() {},
    plugins: [
      externalModules(options.externals, options.root),
      nodeModules(options.modules, shims),
      externalImport,
      ...options.plugins,
    ],
  });
  const { output } = await build.generate({ format: "iife", codeSplitting: false });
  await build.close();
  return output[0].code;
}
