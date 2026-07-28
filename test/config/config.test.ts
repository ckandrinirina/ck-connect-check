import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigValidationError,
  gigabytesToBytes,
  loadConfig,
  parseConfig,
  saveConfig,
} from "../../src/config/config.js";
import {
  BYTES_PER_GIGABYTE,
  DEFAULT_HOST,
  DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WARN_THRESHOLD_PERCENT,
  MIN_ACTIVE_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
  defaultConfig,
  defaultConfigPath,
} from "../../src/config/defaults.js";
import type { AppConfig } from "../../src/config/defaults.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ck-connect-check-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function path(name = "config.json"): string {
  return join(dir, name);
}

describe("defaults", () => {
  it("loads the shipped defaults when no config file exists", () => {
    const result = loadConfig(path("never-written.json"));

    expect(result.config).toEqual({
      host: "192.168.8.1",
      pollIntervalSeconds: 30,
      activePollIntervalSeconds: 2,
      warnThresholdPercent: 90,
      planLimitBytes: null,
    });
  });

  it("reports no problem when the file is simply absent", () => {
    expect(loadConfig(path("never-written.json")).problem).toBeUndefined();
  });

  it("exposes the defaults as named constants", () => {
    expect(DEFAULT_HOST).toBe("192.168.8.1");
    expect(DEFAULT_POLL_INTERVAL_SECONDS).toBe(30);
    expect(DEFAULT_WARN_THRESHOLD_PERCENT).toBe(90);
    expect(MIN_POLL_INTERVAL_SECONDS).toBe(5);
    expect(defaultConfig().planLimitBytes).toBeNull();
  });

  it("polls every two seconds while the panel is open, by default", () => {
    expect(DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS).toBe(2);
    expect(MIN_ACTIVE_POLL_INTERVAL_SECONDS).toBe(1);
    expect(defaultConfig().activePollIntervalSeconds).toBe(2);
  });

  it("hands back a fresh defaults object each call, so callers cannot poison it", () => {
    const first = defaultConfig();
    first.host = "mutated.local";

    expect(defaultConfig().host).toBe("192.168.8.1");
  });
});

describe("save and load round-trip", () => {
  it("returns a written config unchanged", () => {
    const written: AppConfig = {
      host: "192.168.1.1",
      pollIntervalSeconds: 60,
      activePollIntervalSeconds: 3,
      warnThresholdPercent: 75,
      planLimitBytes: gigabytesToBytes(20),
    };

    saveConfig(path(), written);

    expect(loadConfig(path()).config).toEqual(written);
  });

  it("round-trips an unset plan limit", () => {
    saveConfig(path(), defaultConfig());

    expect(loadConfig(path()).config.planLimitBytes).toBeNull();
  });

  it("writes readable JSON, not a binary blob", () => {
    saveConfig(path(), defaultConfig());

    expect(JSON.parse(readFileSync(path(), "utf8"))).toMatchObject({
      host: "192.168.8.1",
    });
  });

  it("creates the containing directory when it does not exist yet", () => {
    const nested = join(dir, "a", "b", "config.json");

    saveConfig(nested, defaultConfig());

    expect(existsSync(nested)).toBe(true);
  });

  it("overwrites a previous config rather than appending to it", () => {
    saveConfig(path(), defaultConfig());
    saveConfig(path(), { ...defaultConfig(), host: "10.0.0.1" });

    expect(loadConfig(path()).config.host).toBe("10.0.0.1");
  });
});

describe("corrupt config", () => {
  it("falls back to defaults when the file is not JSON", () => {
    writeFileSync(path(), "{ this is not json");

    expect(loadConfig(path()).config).toEqual(defaultConfig());
  });

  it("reports the problem instead of throwing when the file is not JSON", () => {
    writeFileSync(path(), "{ this is not json");

    const result = loadConfig(path());

    expect(result.problem).toBeTypeOf("string");
    expect(result.problem).not.toBe("");
  });

  it("falls back to defaults when the JSON holds an invalid value", () => {
    writeFileSync(
      path(),
      JSON.stringify({ ...defaultConfig(), pollIntervalSeconds: 1 }),
    );

    const result = loadConfig(path());

    expect(result.config).toEqual(defaultConfig());
    expect(result.problem).toContain("pollIntervalSeconds");
  });

  it("falls back to defaults when the JSON is not an object at all", () => {
    writeFileSync(path(), '"a string"');

    expect(loadConfig(path()).config).toEqual(defaultConfig());
    expect(loadConfig(path()).problem).toBeTypeOf("string");
  });

  it("fills in missing fields from the defaults rather than failing", () => {
    writeFileSync(path(), JSON.stringify({ host: "10.0.0.1" }));

    const result = loadConfig(path());

    expect(result.problem).toBeUndefined();
    expect(result.config).toEqual({ ...defaultConfig(), host: "10.0.0.1" });
  });
});

describe("plan limit in GB", () => {
  it("stores 20 GB as 20 000 000 000 bytes — decimal GB, not GiB", () => {
    expect(gigabytesToBytes(20)).toBe(20_000_000_000);
    expect(BYTES_PER_GIGABYTE).toBe(1_000_000_000);
  });

  it("accepts a fractional plan limit", () => {
    expect(gigabytesToBytes(1.5)).toBe(1_500_000_000);
  });

  it("accepts zero as a deliberate limit", () => {
    expect(gigabytesToBytes(0)).toBe(0);
  });

  it("persists the converted byte value, not the GB value", () => {
    saveConfig(path(), {
      ...defaultConfig(),
      planLimitBytes: gigabytesToBytes(20),
    });

    expect(JSON.parse(readFileSync(path(), "utf8")).planLimitBytes).toBe(
      20_000_000_000,
    );
  });
});

describe("plan limit validation", () => {
  it("rejects a negative plan limit with a named validation error", () => {
    expect(() => gigabytesToBytes(-1)).toThrow(ConfigValidationError);
  });

  it("names the offending field on a negative plan limit", () => {
    try {
      gigabytesToBytes(-1);
      expect.unreachable("expected a ConfigValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).field).toBe("planLimitGb");
      expect((error as ConfigValidationError).name).toBe(
        "ConfigValidationError",
      );
    }
  });

  it("rejects a non-numeric plan limit", () => {
    expect(() => gigabytesToBytes(Number.NaN)).toThrow(ConfigValidationError);
    expect(() => gigabytesToBytes(Number.POSITIVE_INFINITY)).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects a non-numeric plan limit coming from a config object", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), planLimitBytes: "twenty" }),
    ).toThrow(ConfigValidationError);
  });

  it("names planLimitBytes when a stored plan limit is negative", () => {
    try {
      parseConfig({ ...defaultConfig(), planLimitBytes: -5 });
      expect.unreachable("expected a ConfigValidationError");
    } catch (error) {
      expect((error as ConfigValidationError).field).toBe("planLimitBytes");
    }
  });
});

describe("poll interval validation", () => {
  it("rejects a poll interval below 5 seconds so the router is not hammered", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), pollIntervalSeconds: 4 }),
    ).toThrow(ConfigValidationError);
  });

  it("names pollIntervalSeconds on the rejection", () => {
    try {
      parseConfig({ ...defaultConfig(), pollIntervalSeconds: 0 });
      expect.unreachable("expected a ConfigValidationError");
    } catch (error) {
      expect((error as ConfigValidationError).field).toBe(
        "pollIntervalSeconds",
      );
    }
  });

  it("accepts exactly the 5 second floor", () => {
    expect(
      parseConfig({ ...defaultConfig(), pollIntervalSeconds: 5 })
        .pollIntervalSeconds,
    ).toBe(5);
  });

  it("rejects a non-numeric poll interval", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), pollIntervalSeconds: "30" }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects an empty host", () => {
    expect(() => parseConfig({ ...defaultConfig(), host: "   " })).toThrow(
      ConfigValidationError,
    );
  });

  it("accepts an active interval below the idle floor — a panel on screen may poll fast", () => {
    expect(
      parseConfig({ ...defaultConfig(), activePollIntervalSeconds: 1 })
        .activePollIntervalSeconds,
    ).toBe(1);
  });

  it("rejects an active interval below one second", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), activePollIntervalSeconds: 0.5 }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects an active interval slower than the idle one", () => {
    expect(() =>
      parseConfig({
        ...defaultConfig(),
        pollIntervalSeconds: 30,
        activePollIntervalSeconds: 31,
      }),
    ).toThrow(ConfigValidationError);
  });

  it("names activePollIntervalSeconds on the rejection", () => {
    try {
      parseConfig({ ...defaultConfig(), activePollIntervalSeconds: 0 });
      expect.unreachable("expected a ConfigValidationError");
    } catch (error) {
      expect((error as ConfigValidationError).field).toBe(
        "activePollIntervalSeconds",
      );
    }
  });

  it("rejects a non-numeric active interval", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), activePollIntervalSeconds: "2" }),
    ).toThrow(ConfigValidationError);
  });

  it("falls back to the default when the stored active interval is out of range", () => {
    writeFileSync(
      path(),
      JSON.stringify({ ...defaultConfig(), activePollIntervalSeconds: 0 }),
    );

    const result = loadConfig(path());

    expect(result.config).toEqual(defaultConfig());
    expect(result.problem).toContain("activePollIntervalSeconds");
  });

  it("falls back to the default when the stored active interval is not a number", () => {
    writeFileSync(
      path(),
      JSON.stringify({ ...defaultConfig(), activePollIntervalSeconds: "fast" }),
    );

    const result = loadConfig(path());

    expect(result.config).toEqual(defaultConfig());
    expect(result.problem).toContain("activePollIntervalSeconds");
  });

  it("rejects a warn threshold outside 1–100", () => {
    expect(() =>
      parseConfig({ ...defaultConfig(), warnThresholdPercent: 101 }),
    ).toThrow(ConfigValidationError);
    expect(() =>
      parseConfig({ ...defaultConfig(), warnThresholdPercent: 0 }),
    ).toThrow(ConfigValidationError);
  });
});

describe("injected config path", () => {
  it("reads and writes only the path it is given", () => {
    const real = defaultConfigPath();
    const existedBefore = existsSync(real);

    saveConfig(path(), { ...defaultConfig(), host: "10.0.0.1" });
    loadConfig(path());

    expect(existsSync(path())).toBe(true);
    expect(existsSync(real)).toBe(existedBefore);
  });

  it("resolves the real path lazily, under the user home directory", () => {
    expect(defaultConfigPath().startsWith(homedir())).toBe(true);
    expect(defaultConfigPath().endsWith("config.json")).toBe(true);
  });

  it("keeps Electron out of the config module", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/config/config.ts", import.meta.url)),
      "utf8",
    );
    const defaults = readFileSync(
      fileURLToPath(new URL("../../src/config/defaults.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("from 'electron'");
    expect(defaults).not.toContain("from 'electron'");
  });
});
