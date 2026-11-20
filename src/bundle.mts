// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dedent from "ts-dedent";
import { build, loadConfigFromFile, mergeConfig, normalizePath } from "vite";
import type { InlineConfig, Plugin, Rollup, UserConfig } from "vite";

import { injectedGlobals } from "./extensions.mts";
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
 * The module that holds what vitest and the pool read in place of the globals that they hide. The
 * build puts it next to `worker`, which the sources keep in a directory of its own.
 */
const prelude = fileURLToPath(asset(ext === ".mts" ? "worker/prelude" : "prelude"));

/**
 * The identifiers that the modules of vitest and of the pool read in place of the globals, with the
 * export of the prelude that replaces each. It has the hidden globals and the function that the
 * module runner imports through.
 */
const captured = new Map<string, string>([
  ["__externalImport", "externalImport"],
  ...injectedGlobals.map((name): [string, string] => [name, name]),
]);

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
    // so that vite:resolve does not leave `node:*` to the stub for browsers
    enforce: "pre",
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
 * @param unresolved - receives the message of the error when a specifier does not resolve
 * @returns the plugin
 */
function externalModules(specifiers: string[], root: string, unresolved: string[]): Plugin {
  const id = "\0virtual:externals";
  return {
    name: "vitest-pool-quickjs:externals",
    // so that a plugin of the project, which runs after this one, cannot take the id
    enforce: "pre",
    resolveId: (source) => (source === "virtual:externals" ? id : null),
    async load(this: Rollup.PluginContext, loaded) {
      if (loaded !== id) return null;
      const imports: string[] = [];
      const entries: string[] = [];
      const missing: string[] = [];
      for (const [i, specifier] of specifiers.entries()) {
        const found = await this.resolve(specifier, path.join(root, "noop.mts"));
        if (!found) missing.push(JSON.stringify(specifier));
        // rollup's commonjs plugin answers with a proxy id, `\0<path>?commonjs-es-import`
        const resolved = found && { id: found.id.replace(/^\0(.*)\?commonjs-[\w-]+$/, "$1") };
        // resolve from the project root: the generated module has no directory of its own
        const from = resolved && !resolved.id.startsWith("\0") ? resolved.id : specifier;
        imports.push(`import * as e${i} from ${JSON.stringify(from)};`);
        entries.push(`[${JSON.stringify(specifier)}, e${i}]`);
        if (resolved) entries.push(`[${JSON.stringify(resolved.id)}, e${i}]`);
      }
      if (missing.length > 0) {
        const message = `cannot resolve ${missing.join(", ")} in the externals option from ${root}`;
        unresolved.push(message);
        this.error(message);
      }
      // the prelude runs before the packages, which read the globals of the context while they load
      return dedent`
        import ${JSON.stringify(prelude)};
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
    const replaced = code.replace(": import(file)", ": __externalImport(file)");
    if (replaced === code)
      this.error(
        "vitest changed how it imports externalized modules. " +
          "use a version of vitest that this package supports",
      );
    return replaced;
  },
};

/** A node of the ESTree that `this.parse` gives, which rollup and rolldown both provide. */
interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: any;
}

/**
 * Walks the child nodes of a node.
 * @yields each child node
 */
function* children(n: AstNode): Generator<AstNode> {
  for (const key in n) {
    const child = n[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === "string") yield c;
    } else if (child && typeof child.type === "string") yield child;
  }
}

/** Collects the names that a module declares in its own scope, `var` names included. */
function declaredNames(ast: AstNode): Set<string> {
  const names = new Set<string>();
  const bind = (n: AstNode | null): void => {
    if (!n) return;
    if (n.type === "Identifier") names.add(n.name);
    else if (n.type === "ObjectPattern")
      n.properties.forEach((p: AstNode) => bind(p.value ?? p.argument));
    else if (n.type === "ArrayPattern") n.elements.forEach(bind);
    else if (n.type === "AssignmentPattern") bind(n.left);
    else if (n.type === "RestElement") bind(n.argument);
  };
  const declare = (n: AstNode | null): void => {
    if (!n) return;
    if (n.type === "VariableDeclaration") n.declarations.forEach((d: AstNode) => bind(d.id));
    else if (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") bind(n.id);
    else if (n.type.startsWith("Export")) declare(n.declaration);
    else if (n.type === "ImportDeclaration") n.specifiers.forEach((s: AstNode) => bind(s.local));
  };
  ast.body.forEach(declare);
  // a `var` in a function or a static block stays there
  const vars = (n: AstNode): void => {
    if (/^Function|^ArrowFunction|^StaticBlock/.test(n.type)) return;
    if (n.type === "VariableDeclaration" && n.kind === "var") declare(n);
    for (const c of children(n)) vars(c);
  };
  vars(ast);
  return names;
}

/** The import of an export of the prelude under a name. */
const importFrom = (exported: string, name: string): string =>
  `import { ${exported === name ? name : `${exported} as ${name}`} } from ${JSON.stringify(prelude)};`;

/**
 * Gives a module the captured globals in place of the globals of the context. A module that reads
 * a captured name gets an import of the same name from the prelude, so the scoping of the language
 * leaves a local binding of that name alone. A read of `globalThis.<name>` becomes an import under
 * an alias, since the module may declare the name itself.
 * @param code - the source of the module
 * @param ast - the parsed module
 * @returns the new source, or `null` when the module reads no captured name
 */
export function injectGlobals(code: string, ast: AstNode): string | null {
  const reads = new Set<string>();
  const members: AstNode[] = [];
  const walk = (n: AstNode, parent: AstNode | null): void => {
    if (n.type === "Identifier" && captured.has(n.name)) {
      const p = parent;
      const skipped =
        !p ||
        (p.type === "MemberExpression" && p.property === n && !p.computed) ||
        ((p.type === "Property" ||
          p.type === "MethodDefinition" ||
          p.type === "PropertyDefinition") &&
          p.key === n &&
          !p.computed &&
          !p.shorthand) ||
        /^(Import|Export).*Specifier$/.test(p.type) ||
        p.type === "LabeledStatement" ||
        p.type === "BreakStatement" ||
        p.type === "ContinueStatement" ||
        (p.type === "AssignmentExpression" && p.left === n) ||
        p.type === "UpdateExpression" ||
        // targets that assign, which throws on an import
        p.type === "ArrayPattern" ||
        p.type === "RestElement" ||
        (p.type === "AssignmentPattern" && p.left === n) ||
        ((p.type === "ForOfStatement" || p.type === "ForInStatement") && p.left === n);
      if (!skipped) reads.add(n.name);
      return;
    }
    if (
      n.type === "MemberExpression" &&
      !n.computed &&
      n.object.type === "Identifier" &&
      n.object.name === "globalThis" &&
      n.property.type === "Identifier" &&
      (injectedGlobals as readonly string[]).includes(n.property.name)
    ) {
      const written =
        (parent?.type === "AssignmentExpression" && parent.left === n) ||
        parent?.type === "UpdateExpression" ||
        (parent?.type === "UnaryExpression" && parent.operator === "delete");
      if (!written) members.push(n);
      return;
    }
    for (const c of children(n)) walk(c, n);
  };
  walk(ast, null);
  const declared = declaredNames(ast);
  const imports = [...reads]
    .filter((name) => !declared.has(name))
    .map((name) => importFrom(captured.get(name)!, name));
  const aliased = new Set<string>();
  let out = code;
  for (const m of members.toSorted((a, b) => b.start - a.start)) {
    const name = m.property.name as string;
    aliased.add(name);
    out = out.slice(0, m.start) + `__captured_${name}` + out.slice(m.end);
  }
  for (const name of aliased) imports.push(importFrom(name, `__captured_${name}`));
  if (imports.length === 0) return null;
  // the imports go after a hashbang line
  const at = out.startsWith("#!") ? out.search(/\n|$/) + 1 : 0;
  return `${out.slice(0, at)}${imports.join("\n")}\n${out.slice(at)}`;
}

/**
 * Makes the plugin that gives the modules of the build the captured globals in place of the globals
 * of the context. The prelude, which captures them, and the externals read the context as it is.
 * @param own - the ids of the modules that get them, or `null` for every module
 * @returns the plugin
 */
function capturedGlobals(own: Set<string> | null): Plugin {
  return {
    name: "vitest-pool-quickjs:captured-globals",
    enforce: "post",
    transform(code, id) {
      if (
        id === normalizePath(prelude) ||
        (own && !own.has(id)) ||
        ![...captured.keys()].some((n) => code.includes(n))
      )
        return null;
      const out = injectGlobals(code, this.parse(code) as unknown as AstNode);
      return out === null ? null : { code: out, map: null };
    },
  };
}

/** The warnings of a build that tell why a script fails in the context. */
const telling = /is not exported by|could not be resolved|externalized for browser/i;

/**
 * Runs the Vite build for the worker.
 * @param root - the project root
 * @param input - the entry
 * @param plugins - the plugins
 * @param vite - the settings of the user, which win over the ones of the pool
 * @returns the code of the script
 */
async function bundle(
  root: string,
  input: string,
  plugins: Plugin[],
  vite: InlineConfig,
): Promise<string> {
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (telling.test(message)) warnings.push(message);
  };
  const defaults: InlineConfig = {
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "silent",
    customLogger: {
      info() {},
      warn,
      warnOnce: warn,
      error() {},
      clearScreen() {},
      hasErrorLogged: () => false,
      hasWarned: false,
    },
    resolve: { conditions: ["import", "default"], mainFields: ["module", "main"] },
    plugins,
    build: {
      write: false,
      minify: false,
      target: "esnext",
      modulePreload: false,
      reportCompressedSize: false,
      copyPublicDir: false,
      cssCodeSplit: false,
      sourcemap: false,
      // rollup only. Its commonjs plugin skips the files outside node_modules by default, and a
      // project file such as `default-cjs.js` is CommonJS without a telling extension.
      commonjsOptions: { include: [/\.[cm]?js$/] },
      lib: { entry: input, formats: ["iife"], name: "__worker", fileName: "worker" },
      // rolldown leaves the script sloppy unless it is told, and rollup makes it strict
      rollupOptions: { output: { strict: true } },
    },
  };
  const config = mergeConfig(defaults, vite);
  let result;
  try {
    result = await build(config);
  } catch (cause) {
    const detail = warnings.length > 0 ? `\n${[...new Set(warnings)].join("\n")}` : "";
    throw new Error(`the pool could not bundle the worker${detail}`, { cause });
  }
  // a second format, such as `es` in `build.lib.formats`, makes a second output
  if (Array.isArray(result) && result.length > 1)
    throw new Error(
      `the build of the worker made ${result.length} outputs, and it needs one script. ` +
        "do not set build.lib.formats in the vite option",
    );
  const { output } = (Array.isArray(result) ? result[0]! : result) as Rollup.RolldownOutput;
  // more than one chunk, from a dynamic import for instance, cannot run as one script
  const chunks = output.filter((item) => item.type === "chunk");
  if (chunks.length !== 1)
    throw new Error(
      `the build of the worker made ${chunks.length} chunks, and it needs one script`,
    );
  return chunks[0]!.code;
}

/**
 * Finds the modules that vitest and the pool load, which are the ones that the build reaches
 * without the externals. A module that an external shares with vitest is one of them.
 * @param root - the project root
 * @param input - the entry
 * @param plugins - the plugins of the build
 * @param vite - the settings of the user
 * @returns the ids of the modules
 */
async function ownModules(
  root: string,
  input: string,
  plugins: Plugin[],
  vite: InlineConfig,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const collect: Plugin = {
    name: "vitest-pool-quickjs:collect",
    // transform runs for every module, also for one that another plugin loaded
    transform(_code, id) {
      ids.add(id);
      return null;
    },
  };
  await bundle(root, input, [collect, ...plugins], vite);
  return ids;
}

// Rollup runs the modules of a dynamic import at the start of an iife, where the stubs of Vite and
// the chunks of vitest for Node.js fail, and it rewrites `import.meta.url` into an expression that
// reads `document`. The next three plugins deal with them.

/** Keeps `import.meta.url` an undefined value. It acts on rollup only, which Vite 6 and 7 use. */
const importMetaUrl = {
  name: "vitest-pool-quickjs:import-meta-url",
  resolveImportMeta: (property: string) => (property === "url" ? "undefined" : null),
} as Plugin;

/** Serves an empty module for an optional peer of vitest that is not installed. */
const optionalPeers: Plugin = {
  name: "vitest-pool-quickjs:optional-peers",
  // so that it sees the id before vite:resolve gives the stub of an optional peer
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (!importer || /^([./\0]|[a-zA-Z]:[\\/])/.test(source)) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    return resolved?.id.includes("__vite-optional-peer-dep") ? `\0missing:${source}` : resolved;
  },
  load: (id) => (id.startsWith("\0missing:") ? "export default undefined;" : null),
};

/**
 * Replaces the chunks of vitest for Node.js, which the context never runs, with stubs of their
 * exports. The chunks are found by what they export, since their file names carry a hash.
 * @returns the plugin
 */
function nativeChunks(): Plugin {
  const stubs: [string, string][] = [
    [
      "async function setupNodeLoaderHooks(",
      "export async function setupNodeLoaderHooks() { return false; }",
    ],
    ["class NativeModuleMocker ", "export class NativeModuleMocker {}"],
  ];
  const found = new Set<string>();
  return {
    name: "vitest-pool-quickjs:native-chunks",
    transform(code, id) {
      if (!id.includes("/vitest/dist/chunks/")) return null;
      const stub = stubs.find(([marker]) => code.includes(marker));
      if (!stub) return null;
      found.add(stub[0]);
      return { code: stub[1], map: null };
    },
    buildEnd(error) {
      if (error) return;
      for (const [marker] of stubs)
        if (!found.has(marker))
          this.error(`this vitest is not supported, no chunk of it has \`${marker}\``);
    },
  };
}

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
    buildEnd(error) {
      if (!error && !replaced) {
        this.error(
          "vitest changed how it reads the plain stack. " +
            "use a version of vitest that this package supports",
        );
      }
    },
  };
}

/**
 * Takes the only settings of a Vite config that the build of the worker uses.
 * @param config - the config of the project
 * @returns the aliases, the `define` and the plugins
 */
export const pickConfig = (config: UserConfig): InlineConfig => ({
  resolve: { alias: config.resolve?.alias },
  define: config.define,
  plugins: config.plugins,
});

/**
 * Runs the Vite config file of the project and picks its settings.
 * @param root - the directory that a relative path starts at
 * @param file - the path of the file
 * @returns the settings
 */
export async function loadConfig(root: string, file: string): Promise<InlineConfig> {
  const absolute = path.resolve(root, file);
  await access(absolute).catch(() => {
    throw new Error(`config file not found: ${absolute}`);
  });
  try {
    // silent, since the error goes on in the cause
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "test" },
      absolute,
      root,
      "silent",
    );
    return pickConfig(loaded?.config ?? {});
  } catch (cause) {
    throw new Error(`could not load the config file ${absolute}`, { cause });
  }
}

/**
 * Bundles the worker into one script for a QuickJS context.
 * @param root - the directory that the `externals` resolve from
 * @param options - the externals, modules, plugins and Vite settings of the build; the plugins
 * are added after the plugins of the pool, and `enforce` can move them
 * @returns the source of the script
 */
export async function buildWorker(
  root: string,
  {
    externals = [],
    modules = {},
    plugins = [],
    vite = {},
  }: Pick<QuickJSPoolOptions, "externals" | "modules" | "plugins" | "vite">,
): Promise<string> {
  // the file runs once for the root, and the settings of the vite option win over its settings
  const { configFile, ...inline } = vite;
  const settings =
    configFile === undefined ? inline : mergeConfig(await loadConfig(root, configFile), inline);
  const shims = await shimNames();
  const input = fileURLToPath(asset("worker"));
  const unresolved: string[] = [];
  const pool = (listed: string[]): Plugin[] => [
    externalModules(listed, root, unresolved),
    nodeModules(modules, shims),
    externalImport,
    plainStack(),
    importMetaUrl,
    optionalPeers,
    nativeChunks(),
  ];
  // without externals every module but the prelude is the pool's or vitest's own
  const own =
    externals.length > 0
      ? await ownModules(root, input, [...pool([]), ...plugins], settings)
      : null;
  try {
    return await bundle(
      root,
      input,
      [...pool(externals), capturedGlobals(own), ...plugins],
      settings,
    );
  } catch (error) {
    // the text of the build repeats the message and names the virtual module
    if (unresolved.length > 0) throw new Error(unresolved[0]!);
    throw error;
  }
}
