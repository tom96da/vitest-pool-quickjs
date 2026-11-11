// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { it } from "vitest";

import { sleep } from "../fixture-helpers.mts";

// pool.test.mts reads the timestamps of this project
// oxlint-disable-next-line vitest/expect-expect
it("runs for a while", async () => {
  console.log(`start-b ${Date.now()}`);
  await sleep(1000);
  console.log(`end-b ${Date.now()}`);
});
