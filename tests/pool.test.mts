// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
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
 * Runs a fixture project with the built pool.
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

// the fixture projects load the pool from dist, which `pnpm test` builds first
beforeAll(async () => {
  await access(path.join(root, "dist/index.js")).catch(() => {
    throw new Error("dist/ is missing: run `pnpm build` first, or run the tests with `pnpm test`");
  });
});

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

describe.concurrent("projects that pass", () => {
  it.each([
    ["fixture-node-modules", "Tests  4 passed (4)"],
    ["fixture-prelude", "Tests  1 passed (1)"],
    ["fixture-rejections", "Tests  6 passed (6)"],
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
