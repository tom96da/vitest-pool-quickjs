// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const vitest = path.join(root, "node_modules/vitest/vitest.mjs");

interface Report {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Reads the timestamp that a fixture printed after a label.
 * @param stdout - the output of the run
 * @returns a function from a label to its timestamp
 */
const timeOf = (stdout: string) => (label: string) =>
  Number(new RegExp(`${label} (\\d+)`).exec(stdout)?.[1]);

/**
 * Runs a fixture project with the pool.
 * @param name - the directory of the project under `tests/`
 * @param extra - more arguments for `vitest run`
 * @returns the exit code and the two output streams
 */
async function runFixture(name: string, extra: string[] = []): Promise<Report> {
  const args = [vitest, "run", "--root", path.join(root, "tests", name), ...extra];
  try {
    const { stdout, stderr } = await run(process.execPath, args, {
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

// each describe below is one run of a fixture project, and a project is never run twice at once
describe.concurrent("a failing run", () => {
  let report: Report;
  beforeAll(async () => {
    report = await runFixture("fixture-failing");
  });

  it("exits with code 1 when a test fails", () => {
    expect(report.code).toBe(1);
    expect(report.stdout).toContain("Tests  1 failed | 4 passed (5)");
  });

  it("reports the diff of a failed assertion", () => {
    expect(report.stderr).toContain("expected { a: 1 } to deeply equal { a: 2 }");
  });

  it("writes console.log of the context to stdout", () => {
    expect(report.stdout).toContain("log from the context { a: 1 }");
    expect(report.stderr).not.toContain("log from the context");
  });

  it("writes console.error of the context to stderr", () => {
    expect(report.stderr).toContain("error from the context");
    expect(report.stdout).not.toContain("error from the context");
  });

  it("writes process.stdout.write of the context to stdout", () => {
    expect(report.stdout).toContain("write to stdout from the context");
    expect(report.stderr).not.toContain("write to stdout from the context");
  });

  it("writes process.stderr.write of the context to stderr", () => {
    expect(report.stderr).toContain("write to stderr from the context");
    expect(report.stdout).not.toContain("write to stderr from the context");
  });
});

describe.concurrent("an import that externals does not list", () => {
  it("names the unlisted file and the externals option in its error", async () => {
    const { code, stdout, stderr } = await runFixture("fixture-missing-external");
    expect(code).toBe(1);
    const output = stdout + stderr;
    expect(output).toContain("fixture-missing-external/lib/unlisted.cjs");
    expect(output).toContain("list it in the externals option of quickjsPool");
  });
});

describe.concurrent("console of the context", () => {
  let report: Report;
  beforeAll(async () => {
    report = await runFixture("fixture-console");
  });

  it.each(["a-log", "a-info", "a-debug", "a-table", "{ dir: 1 }"])(
    "writes %s to stdout",
    (line) => {
      expect(report.stdout).toContain(`${line}\n`);
    },
  );

  it.each(["a-warn", "an-error", "Trace: a-trace", "Assertion failed a-failing-assert"])(
    "writes %s to stderr",
    (line) => {
      expect(report.stderr).toContain(`${line}\n`);
    },
  );

  it("writes nothing for a passing assert", () => {
    expect(report.stderr + report.stdout).not.toContain("a-passing-assert");
  });

  it("counts by label", () => {
    expect(report.stdout).toContain("default: 1\ndefault: 2\nlabel: 1\n");
  });

  it("restarts a label after countReset", () => {
    expect(report.stdout).toContain("label: 1\ndefault: 1\n");
  });

  it("indents the lines of a group", () => {
    expect(report.stdout).toContain("outer\n  in-outer\n    in-inner\n");
  });

  it("ends the indent at groupEnd", () => {
    expect(report.stdout).toContain("in-inner\nafter-groups\n");
  });

  it("indents every line of a multi-line message in a group", () => {
    expect(report.stdout).toContain("g\n  multi\n  indented\n");
  });

  it("writes an empty line for a call without arguments", () => {
    expect(report.stdout).toContain("after-groups\n\nmulti\nline\n");
  });

  it("prints nothing for time, timeEnd and timeLog", () => {
    expect(report.stdout + report.stderr).not.toContain("timer-label");
  });
});

describe.concurrent("projects that pass", () => {
  it.each([
    ["fixture-globals", "Tests  50 passed (50)"],
    ["fixture-node-modules", "Tests  10 passed (10)"],
    ["fixture-options", "Tests  7 passed (7)"],
    ["fixture-prelude", "Tests  1 passed (1)"],
    ["fixture-process", "Tests  6 passed (6)"],
    ["fixture-rejections", "Tests  7 passed (7)"],
    ["fixture-text-decoder", "Tests  24 passed (24)"],
    ["fixture-timers", "Tests  5 passed (5)"],
  ])("passes every test of the project %s", async (name, summary) => {
    const { code, stdout } = await runFixture(name);
    expect(stdout).toContain(summary);
    expect(code).toBe(0);
  });
});

// three runs of one project, one after another
describe("fixture-filter", () => {
  it("passes every test without a filter", async () => {
    const { code, stdout } = await runFixture("fixture-filter");
    expect(stdout).toContain("Tests  2 passed (2)");
    expect(code).toBe(0);
  });

  it("runs only the tests that match a name filter", async () => {
    const { code, stdout } = await runFixture("fixture-filter", ["-t", "runs when"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Tests  1 passed | 1 skipped (2)");
  });

  it("names the option to set when the file system cache of vitest is on", async () => {
    const { code, stdout, stderr } = await runFixture("fixture-filter", ["--fsModuleCache"]);
    expect(code).toBe(1);
    expect(stdout + stderr).toContain("set `fsModuleCache: false` in the test options");
  });
});

describe("two test files", () => {
  it("run at the same time", async () => {
    const { code, stdout } = await runFixture("fixture-parallel");
    expect(code).toBe(0);
    const at = timeOf(stdout);
    expect(at("start-a")).toBeLessThan(at("end-b"));
    expect(at("start-b")).toBeLessThan(at("end-a"));
  });

  it("run one after another with one worker", async () => {
    const { code, stdout } = await runFixture("fixture-parallel", ["--maxWorkers=1"]);
    expect(code).toBe(0);
    const at = timeOf(stdout);
    const [first, second] = at("end-a") < at("end-b") ? ["a", "b"] : ["b", "a"];
    expect(at(`end-${first}`)).toBeLessThanOrEqual(at(`start-${second}`));
  });
});
