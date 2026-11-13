// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { snapshotDir } from "./fixture-snapshots/snapshot-dir.mts";

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
    expect(report.stdout).toContain("Tests  2 failed | 4 passed (6)");
  });

  it("reports the diff of a failed assertion", () => {
    expect(report.stderr).toContain("expected { a: 1 } to deeply equal { a: 2 }");
  });

  it("names the error and the line of the source that threw it", () => {
    expect(report.stderr).toContain("RangeError: message of the thrown error");
    expect(report.stderr).toContain("failing.fixture.mts:34:17");
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

describe.concurrent("a job that throws", () => {
  let report: Report;
  beforeAll(async () => {
    report = await runFixture("fixture-job");
  });

  it("reports the message of the error", () => {
    expect(report.stdout + report.stderr).toContain("job exploded");
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

describe.concurrent("an extension that does not exist", () => {
  let report: Report;
  beforeAll(async () => {
    report = await runFixture("fixture-unknown-extension");
  });

  it("stops the run with code 1", () => {
    expect(report.code).toBe(1);
  });

  it("names the extension in its error", () => {
    expect(report.stdout + report.stderr).toContain(
      'unknown extension "nope" in the extensions option',
    );
  });

  it("lists the valid extensions in its error", () => {
    expect(report.stdout + report.stderr).toContain(
      "it accepts url, encoding, headers, crypto, structured-clone",
    );
  });
});

describe("file snapshots", () => {
  const out = path.join(snapshotDir, "out.txt");
  beforeAll(async () => {
    await rm(snapshotDir, { recursive: true, force: true });
  });

  it("writes the snapshots that are new", async () => {
    const { code, stdout } = await runFixture("fixture-snapshots", ["-u"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Snapshots  2 written");
    expect(await readFile(out, "utf8")).toBe("text");
  });

  it("passes when the snapshots match", async () => {
    const { code, stdout } = await runFixture("fixture-snapshots");
    expect(code).toBe(0);
    expect(stdout).toContain("Tests  4 passed (4)");
  });

  it("fails when a file snapshot differs", async () => {
    await writeFile(out, "other");
    const { code, stdout, stderr } = await runFixture("fixture-snapshots");
    expect(code).toBe(1);
    expect(stdout + stderr).toContain("mismatched");
  });

  it("rewrites a file snapshot that differs when asked to update", async () => {
    const { code } = await runFixture("fixture-snapshots", ["-u"]);
    expect(code).toBe(0);
    expect(await readFile(out, "utf8")).toBe("text");
  });

  it("removes the snapshot file of a test file that has no snapshot when asked to update", async () => {
    const orphan = path.join(snapshotDir, "plain.fixture.mts.snap");
    await writeFile(orphan, "// Vitest Snapshot v1\n\nexports[`gone 1`] = `1`;\n");
    const { code } = await runFixture("fixture-snapshots", ["-u"]);
    expect(code).toBe(0);
    await expect(readFile(orphan, "utf8")).rejects.toThrow("ENOENT");
  });
});

describe("an inline snapshot to write", () => {
  it("is refused and leaves the test file as it was", async () => {
    const file = path.join(root, "tests/fixture-inline-snapshot/inline.fixture.mts");
    const before = await readFile(file, "utf8");
    try {
      const { code, stdout, stderr } = await runFixture("fixture-inline-snapshot", ["-u"]);
      expect(code).toBe(1);
      expect(stdout + stderr).toContain("cannot write an inline snapshot into");
      expect(await readFile(file, "utf8")).toBe(before);
    } finally {
      await writeFile(file, before);
    }
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
    ["fixture-extensions", "Tests  5 passed (5)"],
    ["fixture-globals", "Tests  55 passed (55)"],
    ["fixture-mock", "Tests  1 passed (1)"],
    ["fixture-node-modules", "Tests  10 passed (10)"],
    ["fixture-options", "Tests  7 passed (7)"],
    ["fixture-prelude", "Tests  1 passed (1)"],
    ["fixture-process", "Tests  8 passed (8)"],
    ["fixture-promise-matchers", "Tests  3 passed (3)"],
    ["fixture-rejections", "Tests  11 passed (11)"],
    ["fixture-text-decoder", "Tests  23 passed (23)"],
    ["fixture-timers", "Tests  6 passed (6)"],
    ["fixture-vm", "Tests  2 passed (2)"],
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

describe("two contexts that start from one snapshot", () => {
  it("do not share what a file left behind, and repeat what the scripts wrote", async () => {
    // one worker, so that the second file restores the context of the first
    const { code, stdout } = await runFixture("fixture-restore", ["--maxWorkers=1"]);
    expect(stdout).toContain("Tests  6 passed (6)");
    expect(code).toBe(0);
    // what a script writes while it loads comes once for each file, as without a snapshot
    expect(stdout.match(/prelude-output/g)).toHaveLength(2);
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
