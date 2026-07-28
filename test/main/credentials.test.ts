import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, saveConfig } from "../../src/config/config.js";
import { defaultConfig } from "../../src/config/defaults.js";
import {
  clearCredential,
  loadCredential,
  saveCredential,
} from "../../src/main/credentials.js";
import type { SecretStorage } from "../../src/main/credentials.js";

/**
 * The Keychain API's identifier is assembled from fragments on purpose: the last
 * test in this file asserts that the name appears in exactly one source file, so
 * writing it out here would break the very rule being checked.
 */
const KEYCHAIN_API = ["safe", "Storage"].join("");

/** Marks a payload as having been through the stub, the way a real cipher would. */
const STUB_PREFIX = "stub-cipher:";

const PASSWORD = "R0uter-Adm1n-Pa55";
const USERNAME = "admin";

/**
 * Stands in for Electron's Keychain-backed secret storage. Encryption is a
 * reversible prefix, so a blob written by one instance decrypts in another, and
 * anything not carrying the prefix throws — exactly what a real Keychain reset
 * looks like from here.
 */
function stubStorage(available = true): SecretStorage {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string) =>
      Buffer.from(`${STUB_PREFIX}${plainText}`, "utf8"),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString("utf8");

      if (!text.startsWith(STUB_PREFIX)) {
        throw new Error("could not decrypt: not written by this keychain");
      }

      return text.slice(STUB_PREFIX.length);
    },
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ck-connect-check-credentials-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function path(name = "config.json"): string {
  return join(dir, name);
}

function fileText(name = "config.json"): string {
  return readFileSync(path(name), "utf8");
}

describe("saveCredential", () => {
  it("writes the username and an encrypted blob to the config", () => {
    const result = saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(),
    );

    expect(result).toEqual({ ok: true });

    const stored = JSON.parse(fileText()) as Record<string, unknown>;

    expect(stored.routerUsername).toBe(USERNAME);
    expect(stored.routerPasswordBlob).toBeTypeOf("string");
    expect(stored.routerPasswordBlob).not.toBe("");
  });

  it("never lets the plaintext password reach the file", () => {
    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(),
    );

    expect(fileText()).not.toContain(PASSWORD);
  });

  it("keeps the rest of the config intact", () => {
    saveConfig(path(), { ...defaultConfig(), host: "10.0.0.1" });

    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(),
    );

    expect(loadConfig(path()).config.host).toBe("10.0.0.1");
  });

  it("replaces a previously stored credential rather than keeping both", () => {
    const storage = stubStorage();

    saveCredential(path(), { username: "first", password: "one" }, storage);
    saveCredential(path(), { username: "second", password: "two" }, storage);

    expect(loadCredential(path(), storage)).toEqual({
      username: "second",
      password: "two",
    });
  });

  it("reports a failure when the Keychain cannot encrypt", () => {
    const result = saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(false),
    );

    expect(result).toEqual({ ok: false, reason: "encryption-unavailable" });
  });

  it("writes nothing at all when the Keychain cannot encrypt", () => {
    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(false),
    );

    expect(existsSync(path())).toBe(false);
  });

  it("leaves an existing config untouched when the Keychain cannot encrypt", () => {
    saveConfig(path(), { ...defaultConfig(), host: "10.0.0.1" });
    const before = fileText();

    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(false),
    );

    expect(fileText()).toBe(before);
  });

  it("refuses an empty username or password instead of writing a useless blob", () => {
    const storage = stubStorage();

    expect(
      saveCredential(path(), { username: "", password: PASSWORD }, storage),
    ).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(
      saveCredential(path(), { username: USERNAME, password: "" }, storage),
    ).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(existsSync(path())).toBe(false);
  });

  it("logs nothing while handling the password", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(),
    );
    loadCredential(path(), stubStorage());

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("loadCredential", () => {
  it("round-trips a saved username and password", () => {
    const storage = stubStorage();

    saveCredential(path(), { username: USERNAME, password: PASSWORD }, storage);

    expect(loadCredential(path(), storage)).toEqual({
      username: USERNAME,
      password: PASSWORD,
    });
  });

  it("returns null when no config file has ever been written", () => {
    expect(
      loadCredential(path("never-written.json"), stubStorage()),
    ).toBeNull();
  });

  it("returns null when the config holds no credential fields", () => {
    saveConfig(path(), defaultConfig());

    expect(loadCredential(path(), stubStorage())).toBeNull();
  });

  it("returns null when only the username was stored", () => {
    writeFileSync(
      path(),
      JSON.stringify({ ...defaultConfig(), routerUsername: USERNAME }),
    );

    expect(loadCredential(path(), stubStorage())).toBeNull();
  });

  it("returns null, without throwing, when the stored blob cannot be decrypted", () => {
    writeFileSync(
      path(),
      JSON.stringify({
        ...defaultConfig(),
        routerUsername: USERNAME,
        routerPasswordBlob: Buffer.from("written-by-another-keychain").toString(
          "base64",
        ),
      }),
    );

    expect(() => loadCredential(path(), stubStorage())).not.toThrow();
    expect(loadCredential(path(), stubStorage())).toBeNull();
  });

  it("returns null when the Keychain itself is unavailable", () => {
    saveCredential(
      path(),
      { username: USERNAME, password: PASSWORD },
      stubStorage(),
    );

    expect(loadCredential(path(), stubStorage(false))).toBeNull();
  });
});

describe("clearCredential", () => {
  it("removes the stored blob and username", () => {
    const storage = stubStorage();

    saveCredential(path(), { username: USERNAME, password: PASSWORD }, storage);
    clearCredential(path());

    const stored = JSON.parse(fileText()) as Record<string, unknown>;

    expect(stored).not.toHaveProperty("routerPasswordBlob");
    expect(stored).not.toHaveProperty("routerUsername");
  });

  it("leaves loadCredential reporting no password", () => {
    const storage = stubStorage();

    saveCredential(path(), { username: USERNAME, password: PASSWORD }, storage);
    clearCredential(path());

    expect(loadCredential(path(), storage)).toBeNull();
  });

  it("keeps the rest of the config", () => {
    const storage = stubStorage();

    saveConfig(path(), { ...defaultConfig(), host: "10.0.0.1" });
    saveCredential(path(), { username: USERNAME, password: PASSWORD }, storage);
    clearCredential(path());

    expect(loadConfig(path()).config.host).toBe("10.0.0.1");
  });

  it("is harmless when no credential was ever saved", () => {
    saveConfig(path(), defaultConfig());

    expect(() => clearCredential(path())).not.toThrow();
    expect(loadCredential(path(), stubStorage())).toBeNull();
  });
});

describe("the Keychain boundary", () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

  function sourceFiles(): string[] {
    return ["src", "test"].flatMap((top) =>
      readdirSync(join(repoRoot, top), { recursive: true, encoding: "utf8" })
        .filter((entry) => entry.endsWith(".ts"))
        .map((entry) => join(top, entry)),
    );
  }

  it("keeps the Electron Keychain API in src/main/credentials.ts alone", () => {
    const offenders = sourceFiles().filter((file) =>
      readFileSync(join(repoRoot, file), "utf8").includes(KEYCHAIN_API),
    );

    expect(offenders).toEqual([join("src", "main", "credentials.ts")]);
  });

  it("does not import Electron at module load, so the tests need no app", () => {
    const source = readFileSync(
      join(repoRoot, "src", "main", "credentials.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/^import .* from "electron";$/m);
  });
});
