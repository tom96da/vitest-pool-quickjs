// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import type { Rolldown } from "vite";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** The built ES module of a shim by the specifier it stands for, such as `node:path`. */
    modules: Record<string, string>;
  }
}

const directory = new URL("../../src/shims/", import.meta.url);

/** Builds every shim and the modules it imports into one ES module each, by the file name. */
async function buildShims(files: string[]): Promise<Record<string, string>> {
  const result = await build({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "silent",
    resolve: { conditions: ["import", "default"], mainFields: ["module", "main"] },
    build: {
      write: false,
      minify: false,
      target: "esnext",
      reportCompressedSize: false,
      lib: {
        entry: Object.fromEntries(
          files.map((file) => [file.slice(0, -4), fileURLToPath(new URL(file, directory))]),
        ),
        formats: ["es"],
      },
      rolldownOptions: { output: { strict: true } },
    },
  });
  const { output } = (Array.isArray(result) ? result[0]! : result) as Rolldown.RolldownOutput;
  // a chunk that two shims share would have to be served too, so the build must not make one
  if (output.length !== files.length) throw new Error("the shims share a chunk");
  return Object.fromEntries(
    (output as Rolldown.OutputChunk[]).map(({ name, code }) => [
      // the file of node:timers/promises is timers.promises
      `node:${name.replaceAll(".", "/")}`,
      code,
    ]),
  );
}

export default async function setup(project: TestProject): Promise<void> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".mts"));
  project.provide("modules", await buildShims(files));
}
