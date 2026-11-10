// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["tests/*.test.mts"],
  },
});
