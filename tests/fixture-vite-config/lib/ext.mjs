// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dep } from "@lib/dep.mjs";

export const viaAlias = dep;
export const defined = typeof __PROJECT__ === "undefined" ? "undefined" : __PROJECT__;
export const plugged = "__TOKEN__";
