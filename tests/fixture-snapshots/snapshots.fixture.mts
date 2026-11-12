// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// pool.test.mts runs this project, which writes the snapshot files into SNAPSHOT_DIR
it("matches a snapshot", () => {
  expect({ a: 1 }).toMatchSnapshot();
});

it("matches a file snapshot", async () => {
  await expect("text").toMatchFileSnapshot(`${process.env.SNAPSHOT_DIR}/out.txt`);
});

it("matches an inline snapshot that exists", () => {
  expect(1).toMatchInlineSnapshot(`1`);
});
