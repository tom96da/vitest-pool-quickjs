// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, inject, it } from "vitest";

import { evaluate } from "./engine.mts";

// the vm shim reads the host while it loads, so every shim gets one
const host = () => ({});

it.each(Object.keys(inject("modules")))(
  "has every named export of %s on its default export too",
  async (name) => {
    const { shim } = await evaluate(
      dedent`
        import * as namespace from "${name}";
        export default Object.keys(namespace).filter(
          (key) => key !== "default" && namespace.default[key] !== namespace[key],
        );
      `,
      { modules: [name], host },
    );
    expect(shim).toEqual([]);
  },
);
