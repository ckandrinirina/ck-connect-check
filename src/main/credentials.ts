/**
 * The router admin password, kept in the macOS Keychain rather than in
 * `config.json`.
 *
 * `config.json` is plaintext in the user's home directory, so the password never
 * goes there: Electron's Keychain-backed secret storage encrypts it, and only the
 * resulting blob and the username are written. The plaintext exists inside
 * {@link saveCredential} and {@link loadCredential} and nowhere else — it is
 * never formatted into a message, never returned in an error, and never logged.
 *
 * This is the one module in the app allowed to reach for Electron's secret
 * storage. Every function takes it as an argument, so the tests run against a
 * stub with no Keychain and no Electron app; the real API is resolved lazily,
 * because it does not exist before Electron's `ready` event and may not exist at
 * all. An unavailable Keychain is a normal state, reported as a failure to save
 * or as "no password" on load, never a crash.
 */

import { createRequire } from "node:module";

import { loadConfig, saveConfig } from "../config/config.js";
import type { RouterCredential } from "../hilink/types.js";

/**
 * The slice of Electron's secret storage this module uses. Electron's own object
 * satisfies it, and so does a stub — which is the entire point.
 */
export interface SecretStorage {
  /** False before Electron is ready, and on a system with no usable keychain. */
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  /** Throws when the blob was not written by this keychain. */
  decryptString(encrypted: Buffer): string;
}

/** Why a credential was not stored. Neither case writes anything. */
export type CredentialSaveFailure =
  /** The keychain cannot encrypt — Electron is not ready, or there is none. */
  | "encryption-unavailable"
  /** A blank username or password, which is not a credential. */
  | "incomplete";

export type CredentialSaveResult =
  { ok: true } | { ok: false; reason: CredentialSaveFailure };

/**
 * Electron's secret storage, resolved on call rather than at import time. A
 * static import would pull Electron into every module that touches credentials
 * and would run before the `ready` event, so the lookup is deferred to the first
 * call that does not bring its own storage.
 */
function keychainStorage(): SecretStorage {
  const load = createRequire(import.meta.url);
  const electron = load("electron") as { safeStorage: SecretStorage };

  return electron.safeStorage;
}

/**
 * Encrypts `credential.password` and writes it, with the username, to the config
 * at `configPath`. The plaintext never reaches disk.
 *
 * Returns `{ ok: false }` and writes nothing when the keychain cannot encrypt or
 * the credential is blank, so a machine without a keychain simply has no stored
 * password.
 */
export function saveCredential(
  configPath: string,
  credential: RouterCredential,
  storage: SecretStorage = keychainStorage(),
): CredentialSaveResult {
  const username = credential.username.trim();

  if (username === "" || credential.password === "") {
    return { ok: false, reason: "incomplete" };
  }

  if (!storage.isEncryptionAvailable()) {
    return { ok: false, reason: "encryption-unavailable" };
  }

  const routerPasswordBlob = storage
    .encryptString(credential.password)
    .toString("base64");
  const { config } = loadConfig(configPath);

  saveConfig(configPath, {
    ...config,
    routerUsername: username,
    routerPasswordBlob,
  });

  return { ok: true };
}

/**
 * The stored credential, or `null` when there is none to be had — nothing saved,
 * only half of it saved, no keychain available, or a blob this keychain can no
 * longer decrypt. A keychain reset therefore degrades to "no password" instead
 * of throwing, which is what keeps the app running unattended.
 */
export function loadCredential(
  configPath: string,
  storage: SecretStorage = keychainStorage(),
): RouterCredential | null {
  const { config } = loadConfig(configPath);
  const { routerUsername, routerPasswordBlob } = config;

  if (routerUsername === undefined || routerPasswordBlob === undefined) {
    return null;
  }

  if (!storage.isEncryptionAvailable()) return null;

  try {
    return {
      username: routerUsername,
      password: storage.decryptString(
        Buffer.from(routerPasswordBlob, "base64"),
      ),
    };
  } catch {
    // Deliberately swallowed, and deliberately not logged: the error text of a
    // failed decryption is of no use, and the blob is not ours to report.
    return null;
  }
}

/**
 * Forgets the stored credential, leaving the rest of the config alone. Needs no
 * keychain — it only removes what was written.
 */
export function clearCredential(configPath: string): void {
  const { config } = loadConfig(configPath);

  delete config.routerUsername;
  delete config.routerPasswordBlob;

  saveConfig(configPath, config);
}
