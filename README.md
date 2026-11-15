# vitest-pool-quickjs

<!-- badges:start -->
[![npm version](https://img.shields.io/npm/v/vitest-pool-quickjs)](https://npmjs.com/package/vitest-pool-quickjs)
[![node version](https://img.shields.io/node/v/vitest-pool-quickjs)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue)](#license)
[![CI](https://github.com/tom96da/vitest-pool-quickjs/actions/workflows/ci.yml/badge.svg)](https://github.com/tom96da/vitest-pool-quickjs/actions/workflows/ci.yml)
<!-- badges:end -->


A [Vitest](https://vitest.dev/) pool that runs test files in [QuickJS](https://quickjs-ng.github.io/quickjs/).

## How it works

The pool runs the worker of Vitest in a QuickJS context and gives it the globals and Node modules
that QuickJS lacks, so `describe`, `expect`, `vi.mock`, fake timers and the reporters are the ones
of Vitest.

Powered by [quickjs-wasi](https://github.com/vercel-labs/quickjs-wasi).

## Requirements

- Node.js 22.18 or newer.
- Vitest 5.0.3 or newer, and Vite 6.4, 7 or 8.

## Usage

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { quickjsPool } from "vitest-pool-quickjs";

export default defineConfig({
  test: {
    pool: quickjsPool(),
    // the context has no file system to read the cache of Vitest from
    fsModuleCache: false,
  },
});
```

## Options

| Option       | Description                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `externals`  | Modules that a test imports and Vitest does not inline, such as a package from `node_modules`.          |
| `preludes`   | Scripts that run in the context before the tests, to define globals. A path starts at the project root. |
| `modules`    | Source of `node:*` modules by id. It replaces the module that the pool provides.                        |
| `vite`       | Vite settings for the build of the externals and the modules. See [The Vite build](#the-vite-build).    |
| `extensions` | Extensions of quickjs-wasi to load: `url`, `encoding`, `headers`, `crypto` and `structured-clone`.      |
| `snapshot`   | Start the test files from a snapshot of the first one to skip their setup. The default is `true`.       |

For example:

```ts
quickjsPool({ externals: ["pathe"], extensions: ["structured-clone", "crypto"] });
```

## The Vite build

The pool bundles the externals and the modules with Vite, without your Vite config. Your config
still applies to the test files. Set the Vite settings for that build in `vite`, for example:

```ts
quickjsPool({ vite: { resolve: { alias: { "~": "/src" } } } });
```

To reuse a Vite config file, set `vite: { configFile: "vite.config.ts" }`. The path starts at the
project root. The pool takes only `resolve.alias`, `define` and `plugins` from the file. `define`
also applies to the code of Vitest. A config written as a function gets `mode: "test"`.
The plugins may run more than once, so keep them free of side effects.

## Globals

A test sees the standard built-ins of JavaScript, `console`, `performance`, `process`, the timers
and the globals of the extensions that `extensions` lists. `process` has `env`, `versions`, `cwd`,
`memoryUsage`, `stdout`, `stderr` and the methods for listeners.

To add a global, define it in a setup file. A package in `externals` loads before the setup files,
so if it reads the global while it loads, define the global in a script of `preludes`.

## Settings

- Set `fsModuleCache: false`, as in the example. The pool stops with an error when it is on.

## Limits

- With `isolate: false` one context holds the modules of every file.
- A context has 1 GiB of memory.
- Recursion deeper than about 1600 frames of a small function throws a `RangeError`.
- The console does not print `time`, `timeEnd` and `timeLog`.
- A method in a stack trace shows as `m` where V8 shows `Class.m`.
- With `snapshot` on, a value that a script or a package makes while it loads, such as a random id
  or the time, is the same in every test file, and so is the sequence of `Math.random()`. Set
  `snapshot: false` to make them in each file.
- Two `vi.mock` factories that each await `vi.importActual` of a module that imports the other wait
  for each other. The run stops without output while the test file loads. Exclude that file with
  the `exclude` option, and give the job of the CI a timeout.
- An inline snapshot is compared but never written into the test file, so a new or an outdated one
  fails the run. Use `toMatchSnapshot` or `toMatchFileSnapshot` to write one.

## License

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache 2.0](./LICENSE-APACHE).
