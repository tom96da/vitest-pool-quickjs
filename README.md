# vitest-pool-quickjs

A [Vitest](https://vitest.dev/) pool that runs test files in [QuickJS](https://bellard.org/quickjs/).

## How it works

The worker of Vitest runs in a QuickJS context without changes. The pool gives it the globals and
Node modules that QuickJS lacks, so `describe`, `expect`, `vi.mock`, fake timers and the reporters
are the ones of Vitest.

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

| Option      | Description                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| `externals` | Specifiers of the packages that a test imports from `node_modules`.             |
| `preludes`  | Paths of scripts that run in the context before the tests, to define globals.   |
| `modules`   | Source of `node:*` modules by id. It wins over the modules of the pool.         |
| `plugins`   | Rolldown plugins that apply to the modules that the pool loads into the context. |

A test can import a package from `node_modules` when `externals` lists it, for example:

```ts
quickjsPool({ externals: ["pathe"] });
```

## Settings

- Set `fsModuleCache: false`. Vitest 5.1 caches the transformed modules on the file system by
  default and then sends the path of the file, which the context cannot read. The pool stops with an
  error when the option is on.

## Limits

- Test files run one after another in a single thread.
- Each file starts a context and loads a bundle of the worker.
- The context has the globals of the web and of Node that Vitest reads, and no others.
