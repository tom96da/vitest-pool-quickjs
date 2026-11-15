// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The external module of bundle.build.test.mts, a small client of an API.
import { injectedGlobals } from "@/extensions.mts";

export const globals = injectedGlobals;
export const endpoint = __API_URL__;
export const mode = __MODE__;
export const marker = "__PLUGIN_MARK__";
