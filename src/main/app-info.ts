/**
 * Who the app is — name, version, author, repository — read from `package.json`.
 *
 * The manifest is the only place these are typed: a release bumps one file, and
 * everything that shows them (the native About panel, the tray's About item)
 * asks this module, so nothing can quote a version nobody released.
 *
 * Electron packages `package.json` at the app's root, beside `dist/`, so the
 * same relative path resolves from `src/main/` under tests and from
 * `dist/main/` inside the packaged app.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface AppInfo {
  name: string;
  version: string;
  author: string;
  /** The GitHub project, as `repository.url` states it. */
  repositoryUrl: string;
}

const PACKAGE_JSON = fileURLToPath(
  new URL("../../package.json", import.meta.url),
);

interface Manifest {
  name?: unknown;
  version?: unknown;
  author?: unknown;
  repository?: { url?: unknown };
}

function field(value: unknown, key: string, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${path} has no "${key}"`);
  }

  return value;
}

/** Reads the manifest at {@link manifestPath}; throws when a field is missing. */
export function readAppInfo(manifestPath: string = PACKAGE_JSON): AppInfo {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  return {
    name: field(manifest.name, "name", manifestPath),
    version: field(manifest.version, "version", manifestPath),
    author: field(manifest.author, "author", manifestPath),
    repositoryUrl: field(
      manifest.repository?.url,
      "repository.url",
      manifestPath,
    ),
  };
}
