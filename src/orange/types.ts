/**
 * What `http://123.orange.mg/info-conso/` states, once its markup has been
 * read. Pure data — the parse lives in `parse.ts` and the fetch in the poller,
 * exactly as XML never escapes `src/hilink/`.
 */

/**
 * One entry of the page's `Forfaits en cours de validité` section.
 *
 * The portal states *consumed*, not remaining, and only for the forfaits it
 * happens to list — so everything the page may omit is optional here rather
 * than defaulted to zero. A missing figure is a figure the carrier never gave.
 */
export interface OrangeForfait {
  /** The bundle's own name, e.g. `Wifiber Go+ SSE`. */
  label: string;
  /** The category line beneath it, e.g. `Internet`. Absent if unstated. */
  nature?: string;
  /** Consumed volume in decimal octets (1000³). Absent if unstated. */
  consumedBytes?: number;
  /**
   * `data-bundle-type` off the forfait's `.bundle-circlebar`. Known values are
   * `credit`, `data`, `voice` and `sms`, but an unknown one is carried through
   * rather than dropped.
   */
  bundleType?: string;
  /**
   * `data-bundle-pcvalue` off the same element, as stated. Capped bundles draw
   * a ring from it; Wifiber Go+ SSE carries none, and none is synthesised. The
   * page does not say whether it counts consumed or remaining, so it is not
   * reinterpreted here.
   */
  percent?: number;
}

/**
 * The `Compte principal` lines, which describe the subscription rather than
 * any one forfait and are therefore kept out of the forfait list.
 */
export interface OrangeAccount {
  /** The offer the line is on, e.g. `WiFiber`. */
  offer?: string;
  /** The recharge balance in ariary, e.g. `0` for `0 Ar`. */
  balanceAr?: number;
}

/** A whole `info-conso` page, read. */
export interface OrangeInfoConso {
  account: OrangeAccount;
  forfaits: OrangeForfait[];
}
