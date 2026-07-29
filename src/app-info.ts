/** Identity constants shared by the main process, the tray and the popover. */

export const APP_NAME = "ck-connect-check";

export const APP_ID = "com.ckandrinirina.connect-check";

/**
 * The released version, kept in step with `package.json` by the project-setup
 * test rather than by anybody remembering. It lives here beside the name and the
 * bundle id because the packaged app cannot read `package.json` — electron-forge
 * bundles `dist/` and nothing else — so a constant compiled into the build is
 * the only thing the app can honestly report itself as.
 */
export const APP_VERSION = "0.2.0";

/** Default HiLink router address. Overridable from config once T-05 lands. */
export const ROUTER_HOST = "192.168.8.1";
