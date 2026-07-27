/**
 * The XML boundary. Every reply from the router is turned into a typed object
 * here, with numbers converted once; nothing downstream ever sees a string that
 * should have been a number, or raw XML.
 *
 * HiLink replies are a flat list of leaf elements under a single root, so a
 * small scanner is enough and keeps the app free of an XML dependency.
 */

import type {
  BillingCycle,
  CarrierInfo,
  MonthStatistics,
  RouterStatus,
  SessionCredentials,
  TrafficStatistics,
} from './types.js';

/** The router's code for "your session expired" — the cue to re-handshake. */
export const STALE_SESSION_CODE = 125002;

/** `ConnectionStatus` value meaning the mobile link is up. */
const CONNECTED_STATUS = 901;

/** The reply could not be read: malformed XML, or a field missing or non-numeric. */
export class HilinkParseError extends Error {
  readonly endpoint: string;

  constructor(endpoint: string, detail: string) {
    super(`${endpoint}: ${detail}`);
    this.name = 'HilinkParseError';
    this.endpoint = endpoint;
  }
}

/** The reply was well-formed XML, but the router answered with an error code. */
export class HilinkApiError extends Error {
  readonly endpoint: string;
  readonly code: number;

  constructor(endpoint: string, code: number) {
    super(`${endpoint}: router returned error code ${code}`);
    this.name = 'HilinkApiError';
    this.endpoint = endpoint;
    this.code = code;
  }

  get isStaleSession(): boolean {
    return this.code === STALE_SESSION_CODE;
  }
}

/** True only for a stale-session API error — never for a parse failure. */
export function isStaleSessionError(error: unknown): boolean {
  return error instanceof HilinkApiError && error.isStaleSession;
}

interface FlatXml {
  root: string;
  fields: Map<string, string>;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function tagName(raw: string): string {
  return raw.split(/[\s/]/)[0] ?? '';
}

/** Scan a flat HiLink reply into its root name and its leaf elements. */
function scan(xml: string, endpoint: string): FlatXml {
  const source = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack: string[] = [];
  const fields = new Map<string, string>();
  let root = '';
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) {
      if (source.slice(index).trim() !== '') {
        throw new HilinkParseError(endpoint, 'text found outside any element');
      }
      break;
    }

    const text = source.slice(index, open);
    if (stack.length === 0 && text.trim() !== '') {
      throw new HilinkParseError(endpoint, 'text found outside any element');
    }

    const close = source.indexOf('>', open);
    if (close === -1) {
      throw new HilinkParseError(endpoint, 'unterminated tag');
    }
    const raw = source.slice(open + 1, close).trim();
    index = close + 1;

    if (raw === '') {
      throw new HilinkParseError(endpoint, 'empty tag');
    }

    if (raw.startsWith('/')) {
      const name = tagName(raw.slice(1).trim());
      const opened = stack.pop();
      if (opened === undefined) {
        throw new HilinkParseError(endpoint, `closing tag </${name}> has no opening tag`);
      }
      if (opened !== name) {
        throw new HilinkParseError(endpoint, `closing tag </${name}> does not match <${opened}>`);
      }
      if (stack.length === 1) {
        fields.set(name, decodeEntities(text).trim());
      }
      continue;
    }

    if (raw.endsWith('/')) {
      if (stack.length === 1) {
        fields.set(tagName(raw), '');
      }
      continue;
    }

    const name = tagName(raw);
    if (stack.length === 0) {
      if (root !== '') {
        throw new HilinkParseError(endpoint, 'more than one root element');
      }
      root = name;
    }
    stack.push(name);
  }

  if (stack.length > 0) {
    throw new HilinkParseError(endpoint, `<${stack[stack.length - 1]}> is never closed`);
  }
  if (root === '') {
    throw new HilinkParseError(endpoint, 'no XML element found');
  }
  return { root, fields };
}

/**
 * Read a reply into its fields, translating an `<error>` root into a typed API
 * error so a stale session is never mistaken for malformed XML.
 */
function readReply(xml: string, endpoint: string): Map<string, string> {
  const { root, fields } = scan(xml, endpoint);
  if (root === 'error') {
    const code = fields.get('code');
    if (code === undefined || !/^-?\d+$/.test(code)) {
      throw new HilinkParseError(endpoint, 'error reply without a numeric <code>');
    }
    throw new HilinkApiError(endpoint, Number(code));
  }
  return fields;
}

function requireText(fields: Map<string, string>, key: string, endpoint: string): string {
  const value = fields.get(key);
  if (value === undefined) {
    throw new HilinkParseError(endpoint, `missing field <${key}>`);
  }
  return value;
}

function requireNumber(fields: Map<string, string>, key: string, endpoint: string): number {
  const value = requireText(fields, key, endpoint);
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw new HilinkParseError(endpoint, `<${key}> is not numeric: "${value}"`);
  }
  return Number(value);
}

const UNIT_BYTES: Record<string, number> = {
  B: 1,
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
  TB: 1_000_000_000_000,
};

/** `DataLimit` arrives as `0MB` or `50GB`; carriers bill in decimal units. */
function parseDataLimitBytes(value: string, endpoint: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([A-Za-z]*)$/.exec(value.trim());
  const unit = match ? (match[2] || 'B').toUpperCase() : '';
  const scale = UNIT_BYTES[unit];
  if (!match || scale === undefined) {
    throw new HilinkParseError(endpoint, `<DataLimit> is not a data size: "${value}"`);
  }
  return Number(match[1]) * scale;
}

export function parseSesTokInfo(xml: string): SessionCredentials {
  const endpoint = '/api/webserver/SesTokInfo';
  const fields = readReply(xml, endpoint);
  return {
    sessionId: requireText(fields, 'SesInfo', endpoint),
    token: requireText(fields, 'TokInfo', endpoint),
  };
}

export function parseMonthStatistics(xml: string): MonthStatistics {
  const endpoint = '/api/monitoring/month_statistics';
  const fields = readReply(xml, endpoint);
  return {
    monthDownloadBytes: requireNumber(fields, 'CurrentMonthDownload', endpoint),
    monthUploadBytes: requireNumber(fields, 'CurrentMonthUpload', endpoint),
    monthDurationSeconds: requireNumber(fields, 'MonthDuration', endpoint),
    monthLastClearTime: requireText(fields, 'MonthLastClearTime', endpoint),
  };
}

export function parseTrafficStatistics(xml: string): TrafficStatistics {
  const endpoint = '/api/monitoring/traffic-statistics';
  const fields = readReply(xml, endpoint);
  return {
    downloadRateBps: requireNumber(fields, 'CurrentDownloadRate', endpoint),
    uploadRateBps: requireNumber(fields, 'CurrentUploadRate', endpoint),
    connectTimeSeconds: requireNumber(fields, 'CurrentConnectTime', endpoint),
  };
}

export function parseStatus(xml: string): RouterStatus {
  const endpoint = '/api/monitoring/status';
  const fields = readReply(xml, endpoint);
  return {
    connected: requireNumber(fields, 'ConnectionStatus', endpoint) === CONNECTED_STATUS,
    signalBars: requireNumber(fields, 'SignalIcon', endpoint),
    maxSignalBars: requireNumber(fields, 'maxsignal', endpoint),
    connectedDevices: requireNumber(fields, 'CurrentWifiUser', endpoint),
  };
}

export function parseCurrentPlmn(xml: string): CarrierInfo {
  const endpoint = '/api/net/current-plmn';
  const fields = readReply(xml, endpoint);
  return { carrier: requireText(fields, 'FullName', endpoint) };
}

export function parseStartDate(xml: string): BillingCycle {
  const endpoint = '/api/monitoring/start_date';
  const fields = readReply(xml, endpoint);
  return {
    startDay: requireNumber(fields, 'StartDay', endpoint),
    routerDataLimitBytes: parseDataLimitBytes(requireText(fields, 'DataLimit', endpoint), endpoint),
    warnThresholdPercent: requireNumber(fields, 'MonthThreshold', endpoint),
  };
}
