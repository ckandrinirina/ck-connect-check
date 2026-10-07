import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfigPath } from "../../src/config/defaults.js";

describe("defaultConfigPath", () => {
  it("puts the config under %APPDATA% on Windows", () => {
    const env = { APPDATA: "C:\\Users\\ck\\AppData\\Roaming" };

    expect(defaultConfigPath("win32", env)).toBe(
      "C:\\Users\\ck\\AppData\\Roaming\\ck-connect-check\\config.json",
    );
  });

  it("falls back to the roaming profile under the home directory when %APPDATA% is unset", () => {
    const path = defaultConfigPath("win32", {});

    expect(path.startsWith(homedir())).toBe(true);
    expect(
      path.endsWith("\\AppData\\Roaming\\ck-connect-check\\config.json"),
    ).toBe(true);
  });

  it("keeps the macOS path under Application Support, whatever %APPDATA% says", () => {
    expect(defaultConfigPath("darwin", { APPDATA: "C:\\elsewhere" })).toBe(
      join(
        homedir(),
        "Library",
        "Application Support",
        "ck-connect-check",
        "config.json",
      ),
    );
  });
});
