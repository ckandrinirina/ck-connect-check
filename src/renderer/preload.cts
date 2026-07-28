/**
 * The only way the panel can talk back to the main process.
 *
 * The page runs under `default-src 'none'` with context isolation on, so it has
 * no `require`, no network and no Electron. This script runs beside it in the
 * isolated world and hands it exactly three sends — start a sync, store a
 * password, and set the plan size — and nothing else: no `ipcRenderer`, no
 * channel names, no way to reach a channel this file does not name.
 *
 * It is a `.cts` on purpose. The rest of the app is ESM, but a preload script is
 * loaded by Electron rather than by Node's ESM loader, so it is emitted as
 * `dist/renderer/preload.cjs` and loaded as CommonJS.
 *
 * Nothing here is logged. The password crosses this file on its way to
 * `src/main/credentials.ts` and is never written down on the way.
 */

import { contextBridge, ipcRenderer } from "electron";

/** Kept in step with `src/main/popover.ts`, which listens on the same names. */
const SYNC_CHANNEL = "popover:sync";
const SAVE_PASSWORD_CHANNEL = "popover:save-password";
const SET_PLAN_LIMIT_CHANNEL = "popover:set-plan-limit";

contextBridge.exposeInMainWorld("popoverBridge", {
  sync(): void {
    ipcRenderer.send(SYNC_CHANNEL);
  },
  savePassword(credential: { username: string; password: string }): void {
    // Rebuilt rather than forwarded, so nothing the page hangs off the object
    // travels with it.
    ipcRenderer.send(SAVE_PASSWORD_CHANNEL, {
      username: credential.username,
      password: credential.password,
    });
  },
  setPlanLimit(value: string): void {
    // The characters as typed. What a Go is worth in bytes is settled in the
    // main process, which is also where the refusal is worded.
    ipcRenderer.send(SET_PLAN_LIMIT_CHANNEL, String(value));
  },
});
