// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Prepares a copy of the unit tests of Vitest that runs without building the monorepo, and runs
// them with the stock pool and with this pool. The tests come from the submodule `vitest/`. The
// arguments after the command go to `vitest run`.
//
//   node scripts/vitest-mirror.mts prepare
//   node scripts/vitest-mirror.mts baseline [files]
//   node scripts/vitest-mirror.mts pool [files]
//   node scripts/vitest-mirror.mts compare

import { spawn } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters, styleText } from "node:util";

import { dedent } from "ts-dedent";

import externals from "./vitest-externals.json" with { type: "json" };

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "vitest");
// a path with a directory that starts with a dot would not match the globs of the config of Vitest
const mirror = process.env.VITEST_MIRROR ?? path.join(os.tmpdir(), "vitest-pool-quickjs-mirror");

/** The file that marks a directory as a mirror, so that only a mirror is removed. */
const marker = ".vitest-mirror";

/** The packages whose dependencies the copied sources need. */
const packages = ["vitest", "mocker", "snapshot", "utils", "expect", "pretty-format", "web-worker"];

/** The packages that the copied sources of Vitest import from the published ones. */
const published = ["@vitest/spy", "@vitest/snapshot"];

/** The packages that the sources and the tests load and that only the development dependencies declare. */
const development = ["acorn-walk", "jsdom", "happy-dom", "@edge-runtime/vm", "natural-compare"];

type Dependencies = Record<string, string>;

interface PackageJson {
  version?: string;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
}

/**
 * Reads a JSON file.
 * @param file - the path of the file
 * @returns the parsed content
 */
const readJson = async (file: string): Promise<PackageJson> =>
  JSON.parse(await readFile(file, "utf8")) as PackageJson;

/**
 * Reads the catalog of versions of the workspace file of Vitest.
 * @returns the version range of each package
 */
async function readCatalog(): Promise<Dependencies> {
  const catalog: Dependencies = {};
  let inside = false;
  for (const line of (await readFile(path.join(source, "pnpm-workspace.yaml"), "utf8")).split(
    "\n",
  )) {
    if (line.startsWith("catalog:")) inside = true;
    else if (inside && /^\S/.test(line)) inside = false;
    const entry = inside ? /^\s+'?([^':]+)'?:\s*(\S+)/.exec(line) : null;
    if (entry) catalog[entry[1]!] = entry[2]!;
  }
  return catalog;
}

/**
 * Runs a command and waits for it.
 * @param command - the program
 * @param args - the arguments
 * @param cwd - the directory to run in
 */
const run = (command: string, args: string[], cwd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, CLAUDECODE: "", AI_AGENT: "", CLAUDE_CODE_ENTRYPOINT: "" },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });

/**
 * Sets the environment of the copied test files to node. A file that asks for another environment
 * would not start in this pool, and the report would not name it. Without the environment, its tests
 * run and the ones that need the globals of a browser fail by themselves.
 * @param dir - the directory of the copied unit tests
 */
async function useNodeEnvironment(dir: string): Promise<void> {
  const environment = /(@vitest-environment\s+)(?!node\b)([^\s*]+)/;
  for (const file of await readdir(dir, { recursive: true })) {
    if (!/\.[cm]?[jt]s$/.test(file) || file.includes("node_modules")) continue;
    const code = await readFile(path.join(dir, file), "utf8");
    const match = environment.exec(code);
    if (!match) continue;
    console.log(`environment node <- ${match[2]}  ${file}`);
    await writeFile(path.join(dir, file), code.replace(environment, "$1node"));
  }
}

/** Copies what the unit tests need out of the submodule, and installs the published packages. */
async function prepare(): Promise<void> {
  const unit = path.join(source, "test/unit");
  const version = (await readJson(path.join(source, "packages/vitest/package.json"))).version;
  if (!version) throw new Error("the submodule vitest is empty. run git submodule update --init");

  const entries = await readdir(mirror).catch((): string[] => []);
  if (entries.length > 0 && !entries.includes(marker)) {
    throw new Error(
      `${mirror} is not empty and is not a mirror. choose another with VITEST_MIRROR`,
    );
  }
  await rm(mirror, { recursive: true, force: true });
  await mkdir(mirror, { recursive: true });
  await writeFile(path.join(mirror, marker), "");
  const copy = (from: string, to: string) =>
    cp(from, path.join(mirror, to), {
      recursive: true,
      filter: (file) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(file),
    });
  await Promise.all([
    copy(path.join(source, "packages"), "packages"),
    copy(unit, "test/unit"),
    copy(path.join(source, "test/test-utils"), "test/test-utils"),
    ...["tsconfig.base.json", "tsconfig.build.json", "tsconfig.check.json"].map((file) =>
      copy(path.join(source, file), file),
    ),
  ]);

  await useNodeEnvironment(path.join(mirror, "test/unit"));

  const catalog = await readCatalog();
  const resolve = (name: string, range: string) =>
    range.startsWith("catalog:")
      ? catalog[name]!
      : range.startsWith("workspace:")
        ? version
        : range;
  const dependencies: Dependencies = {};
  for (const [name, range] of Object.entries(
    (await readJson(path.join(unit, "package.json"))).devDependencies ?? {},
  )) {
    dependencies[name] = /^(file|link):\.\//.test(range)
      ? range.replace("./", "./test/unit/")
      : resolve(name, range);
  }
  for (const name of packages) {
    const manifest = await readJson(path.join(source, "packages", name, "package.json"));
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      dependencies[dependency] ??= resolve(dependency, range);
    }
    for (const [dependency, range] of Object.entries(manifest.devDependencies ?? {})) {
      if (development.includes(dependency)) dependencies[dependency] ??= resolve(dependency, range);
    }
  }
  for (const name of published) dependencies[name] = version;
  dependencies.vite = catalog.vite!;

  await writeFile(
    path.join(mirror, "package.json"),
    JSON.stringify(
      { name: "vitest-mirror", private: true, type: "module", devDependencies: dependencies },
      null,
      2,
    ),
  );
  const pool = pathToFileURL(path.join(root, "src/index.mts")).href;
  await writeFile(path.join(mirror, "test/unit/forks.config.ts"), makeConfig("", `pool: "forks",`));
  await writeFile(
    path.join(mirror, "test/unit/pool.config.ts"),
    makeConfig(
      `import { quickjsPool } from ${JSON.stringify(pool)};`,
      dedent`
        pool: quickjsPool({ externals: ${JSON.stringify(externals)} }),
        fsModuleCache: false,
        maxWorkers: 1,
        execArgv: undefined,
      `,
    ),
  );
  await run(
    "pnpm",
    ["install", "--ignore-workspace", "--ignore-scripts", "--config.node-linker=hoisted"],
    mirror,
  );
  console.log(`Mirror created: ${mirror}`);
}

/**
 * Makes the config that runs the unit project of Vitest with a pool. The report goes to the file
 * of the environment variable OUT.
 * @param header - the imports of the config
 * @param options - the options of the pool
 * @returns the source of the config
 */
const makeConfig = (header: string, options: string): string => dedent`
  import base from "./vite.config.ts";
  ${header}

  const { projects: _projects, ...test } = base.test!;
  export default {
    ...base,
    test: {
      ...test,
      typecheck: { enabled: false },
      reporters: ["default", "json"],
      outputFile: { json: process.env.OUT },
      testTimeout: 10_000,
      hookTimeout: 10_000,
      ${options}
    },
  };
`;

/**
 * Runs the unit tests of Vitest in the mirror and writes the report. A failing run is not an
 * error, because the report tells what failed.
 * @param config - the name of the config in the unit project
 * @param report - the default name of the report in the mirror
 * @param args - more arguments for `vitest run`, such as the files to run
 */
async function vitest(config: string, report: string, args: string[]): Promise<void> {
  process.env.OUT ??= path.join(mirror, report);
  await run(
    process.execPath,
    [path.join(mirror, "node_modules/vitest/vitest.mjs"), "run", "--config", config, ...args],
    path.join(mirror, "test/unit"),
  ).catch(() => {});
}

interface Report {
  testResults: {
    name: string;
    message?: string;
    assertionResults: { fullName: string; status: string; failureMessages: string[] }[];
  }[];
}

/**
 * Lists the tests that pass in the baseline and not in the pool, file by file in the style of the
 * reporter of Vitest, then the counts by reason.
 */
async function compare(): Promise<void> {
  const read = async <T,>(file: string): Promise<T> =>
    JSON.parse(await readFile(path.join(mirror, file), "utf8")) as T;
  const base = await read<Report>("baseline.json");
  const pool = await read<Report>("pool.json");
  const poolFiles = new Map(pool.testResults.map((file) => [file.name, file]));
  const passed = new Set(
    pool.testResults.flatMap((file) =>
      file.assertionResults
        .filter((t) => t.status === "passed")
        .map((t) => `${file.name}\t${t.fullName}`),
    ),
  );
  // paths inside the mirror are shown relative to it, and the colors of the messages are dropped
  // because a line that is cut off would leave a color on
  const short = (text: string) =>
    stripVTControlCharacters(text)
      .replaceAll(`file://${mirror}/`, "")
      .replaceAll(`${mirror}/`, "")
      .replaceAll("node_modules/", "");
  const counts = new Map<string, number>();
  let total = 0;
  let lost = 0;
  let files = 0;
  for (const file of [...base.testResults].sort((a, b) => a.name.localeCompare(b.name))) {
    const inPool = poolFiles.get(file.name);
    const own = file.assertionResults.filter((t) => t.status === "passed");
    total += own.length;
    const missing = own.filter((t) => !passed.has(`${file.name}\t${t.fullName}`));
    if (missing.length === 0) continue;
    lost += missing.length;
    files++;
    // the colors of the reporter of Vitest, which dims the counts and marks the failures
    const summary = `${styleText("dim", `(${own.length} tests | `)}${styleText("red", `${missing.length} lost`)}${styleText("dim", ")")}`;
    console.log(
      `\n${styleText("red", "❯")} ${path.relative(path.join(mirror, "test/unit"), file.name)} ${summary}`,
    );
    let previous = "";
    for (const test of missing) {
      const reason = short(
        !inPool
          ? "UNEXPECTED: file missing from the pool report"
          : (inPool.assertionResults
              .find((t) => t.fullName === test.fullName)
              ?.failureMessages.join("\n")
              .split("\n")
              .find((line) => line.trim() && !/^\s+at /.test(line)) ??
              (inPool.message || "no reason in the report")),
      ).split("\n")[0]!;
      // quoted values and numbers differ per test, the rest names the reason
      const group = reason.replace(/(["'`]).*?\1|\d+/g, "#").slice(0, 100);
      counts.set(group, (counts.get(group) ?? 0) + 1);
      console.log(`  ${styleText("red", "×")} ${test.fullName}`);
      if (reason !== previous) console.log(`      ${reason}`);
      previous = reason;
    }
  }
  console.log(`\n Files  ${files} with lost tests`);
  console.log(
    ` Tests  ${lost} lost | ${total - lost} pass in both (${total} pass in the baseline)\n`,
  );
  console.log("Lost tests by reason:");
  for (const [group, n] of [...counts].sort((a, b) => b[1] - a[1]))
    console.log(`${String(n).padStart(5)}  ${group}`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "prepare") await prepare();
else if (command === "baseline") await vitest("forks.config.ts", "baseline.json", args);
else if (command === "pool") await vitest("pool.config.ts", "pool.json", args);
else if (command === "compare") await compare();
else
  throw new Error(
    "usage: node scripts/vitest-mirror.mts prepare|baseline|pool|compare [vitest args]",
  );
