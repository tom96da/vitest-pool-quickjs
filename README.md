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

| Option       | Description                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `externals`  | Specifiers of the packages and relative files that a test imports.                                 |
| `preludes`   | Paths of scripts that run in the context before the tests, to define globals.                      |
| `modules`    | Source of `node:*` modules by id. It wins over the modules of the pool.                            |
| `plugins`    | Rolldown plugins that apply to the modules that the pool loads into the context.                   |
| `extensions` | Extensions of quickjs-wasi to load: `url`, `encoding`, `headers`, `crypto` and `structured-clone`. |

A test can import a package from `node_modules` or a relative file when `externals` lists it, for
example:

```ts
quickjsPool({ externals: ["pathe"] });
```

An extension defines globals of the web. List the ones to use, for example:

```ts
quickjsPool({ extensions: ["structured-clone", "crypto"] });
```

## Settings

- Set `fsModuleCache: false`. Vitest 5.1 caches the transformed modules on the file system by
  default and then sends the path of the file, which the context cannot read. The pool stops with an
  error when the option is on.

## Limits

- With `isolate: false` one context holds the modules of every file.
- A context has 1 GiB of memory.
- Recursion deeper than about 1600 frames of a small function throws a `RangeError`.
- The context has the globals of the web and of Node that Vitest reads and those of the extensions
  that the option lists, and no others.
- The console does not print `time`, `timeEnd` and `timeLog`.
- A method in a stack trace shows as `m` where V8 shows `Class.m`.
- Two `vi.mock` factories that each await `vi.importActual` of a module that imports the other wait
  for each other. The run stops without output while the test file loads. Exclude that file with
  the `exclude` option, and give the job of the CI a timeout.
- An inline snapshot is compared but never written into the test file, so a new or an outdated one
  fails the run. Use `toMatchSnapshot` or `toMatchFileSnapshot` to write one.

## License

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache 2.0](./LICENSE-APACHE).
