// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import base from "./vite.config.mts";

export default ({ mode, command }: { mode: string; command: string }) => ({
  ...base,
  define: { __PROJECT__: JSON.stringify(`${command} ${mode}`) },
});
