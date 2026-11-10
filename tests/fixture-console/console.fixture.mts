// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { it } from "vitest";

// pool.test.mts reads the report of this project
// oxlint-disable-next-line vitest/expect-expect
it("writes to every level", () => {
  console.log("a-log");
  console.info("a-info");
  console.debug("a-debug");
  console.table("a-table");
  console.dir({ dir: 1 });
  console.warn("a-warn");
  console.error("an-error");
  console.trace("a-trace");
  console.assert(true, "a-passing-assert");
  console.assert(false, "a-failing-assert");
  console.count();
  console.count();
  console.count("label");
  console.countReset();
  console.count();
  console.group("outer");
  console.log("in-outer");
  console.group();
  console.log("in-inner");
  console.groupEnd();
  console.groupEnd();
  console.log("after-groups");
  console.log();
  console.log("multi\nline");
  console.group("g");
  console.log("multi\nindented");
  console.groupEnd();
  console.time("timer-label");
  console.timeLog("timer-label");
  console.timeEnd("timer-label");
});
