// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// sloppy-only code, it assigns a global that nothing declared
exports.run = function () {
  leakedByPackage = 5;
  return leakedByPackage;
};
