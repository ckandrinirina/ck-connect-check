/**
 * The only way the panel can talk back to the main process.
 *
 * The page runs under `default-src 'none'` with context isolation on, so it has
 * no `require`, no network and no Electron. This script runs beside it in the
 * isolated world and hands it exactly five sends — start a sync, store a
 * password, set the plan size, set the plan length and name the forfait to
 * measure — and nothing else: no `ipcRenderer`, no channel names, no way to
 * reach a channel this file does not name.
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
const SET_PLAN_DAYS_CHANNEL = "popover:set-plan-days";
const CHOOSE_FORFAIT_CHANNEL = "popover:choose-forfait";

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
  setPlanDays(value: string): void {
    // The characters as typed, for the same reason as the cap beside it.
    ipcRenderer.send(SET_PLAN_DAYS_CHANNEL, String(value));
  },
  chooseForfait(label: string): void {
    // The carrier's own label, untouched. Which plan it names is settled
    // against the next page read, not here.
    ipcRenderer.send(CHOOSE_FORFAIT_CHANNEL, String(label));
  },
});
