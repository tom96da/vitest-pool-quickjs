# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- the `snapshot` option starts each test file from a snapshot of the first one, which skips its setup ([1a103d5](https://github.com/tom96da/vitest-pool-quickjs/commit/1a103d5))

### Changed

- with the snapshot, values made at load time and `Math.random()` are the same in every file ([1a103d5](https://github.com/tom96da/vitest-pool-quickjs/commit/1a103d5))

### Fixed

- `process.env` has the variables that Vitest sets for a worker, such as `NODE_ENV`, `VITEST` and `TEST` ([95ffe13](https://github.com/tom96da/vitest-pool-quickjs/commit/95ffe13))

## [0.2.3] - 2026-11-13

### Fixed

- the report of a failed test names the error and points at the line of the source ([1b9fe77](https://github.com/tom96da/vitest-pool-quickjs/commit/1b9fe77))

## [0.2.2] - 2026-11-13

### Added

- all the extensions of quickjs-wasi are available through the `extensions` option ([6cc1129](https://github.com/tom96da/vitest-pool-quickjs/commit/6cc1129))
- file-based snapshot assertions are available ([744b1ac](https://github.com/tom96da/vitest-pool-quickjs/commit/744b1ac))

## [0.2.1] - 2026-11-12

### Added

- `TextEncoder` is available ([4086e68](https://github.com/tom96da/vitest-pool-quickjs/commit/4086e68))
- the `fatal` and `ignoreBOM` options of `TextDecoder` are available ([4086e68](https://github.com/tom96da/vitest-pool-quickjs/commit/4086e68))
- an async function or a promise executor that rejects with nothing to handle it is reported ([f2fdafa](https://github.com/tom96da/vitest-pool-quickjs/commit/f2fdafa))

### Changed

- decode a view of a `SharedArrayBuffer`, but no longer the buffer itself ([4086e68](https://github.com/tom96da/vitest-pool-quickjs/commit/4086e68))

### Fixed

- make `expect(promise).resolves` and `.rejects` work ([f2fdafa](https://github.com/tom96da/vitest-pool-quickjs/commit/f2fdafa))

## [0.2.0] - 2026-11-12

### Changed

- run the context on quickjs-wasi, which embeds a newer QuickJS ([6e4ec8a](https://github.com/tom96da/vitest-pool-quickjs/commit/6e4ec8a))
- decode large inputs with `TextDecoder` quickly ([7263a63](https://github.com/tom96da/vitest-pool-quickjs/commit/7263a63))

### Fixed

- keep the worker alive when `vi.resetModules()` drops a `FinalizationRegistry` ([6e4ec8a](https://github.com/tom96da/vitest-pool-quickjs/commit/6e4ec8a))
- throw a `RangeError` that the code can catch on deep recursion ([6e4ec8a](https://github.com/tom96da/vitest-pool-quickjs/commit/6e4ec8a))

## [0.1.2] - 2026-11-12

### Added

- parallel runs of the test files are available, as many at a time as `maxWorkers` allows ([39b0c35](https://github.com/tom96da/vitest-pool-quickjs/commit/39b0c35))

## [0.1.1] - 2026-11-12

### Fixed

- let a test import a relative file such as a CommonJS file through `externals` ([3283a52](https://github.com/tom96da/vitest-pool-quickjs/commit/3283a52))
- decode UTF-8 in `TextDecoder` ([3283a52](https://github.com/tom96da/vitest-pool-quickjs/commit/3283a52))
- make `URL`, `URLSearchParams`, `AbortController` and `process` events behave as on the web ([3283a52](https://github.com/tom96da/vitest-pool-quickjs/commit/3283a52))

## [0.1.0] - 2026-11-11

### Features

- run Vitest tests in QuickJS
- automatically provide missing Web and Node.js globals
- easily integrate by adding it to your config file

[Unreleased]: https://github.com/tom96da/vitest-pool-quickjs/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.2.3
[0.2.2]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.2.2
[0.2.1]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.2.1
[0.2.0]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.2.0
[0.1.2]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.1.2
[0.1.1]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.1.1
[0.1.0]: https://github.com/tom96da/vitest-pool-quickjs/releases/tag/v0.1.0
