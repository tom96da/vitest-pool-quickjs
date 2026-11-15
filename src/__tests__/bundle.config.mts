// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The config file of a project, as bundle.test.mts loads it. Like many
// project configs it reads the address of its API from the environment and fails without it.
import path from "node:path";

import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => {
  if (!process.env.API_URL) throw new Error("API_URL is not set");
  return {
    resolve: {
      alias: { "@": path.join(import.meta.dirname, "..") },
      conditions: ["development"],
    },
    define: {
      __API_URL__: JSON.stringify(process.env.API_URL),
      __MODE__: JSON.stringify(`${command}:${mode}`),
    },
    plugins: [{ name: "marker" }],
    envDir: "env",
    build: { outDir: "dist", minify: true },
  };
});
