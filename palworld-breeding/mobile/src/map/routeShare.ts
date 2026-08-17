/** The route wire format: text a friend can read, a phone can import.
 *
 * A shared route is a chat message. The top half is for the humans in the
 * chat — a header and the numbered stops. The last line is for the phone:
 * `[palforge-route <base64>]`, base64 because messaging apps rewrite
 * straight quotes into curly ones (smart punctuation) and raw JSON in a
 * chat message is a format that corrupts itself in transit.
 *
 * The payload is {v, region, stops:[[u,v,label]…]} at full float precision:
 * the in-game readout is display, uv is truth, and import must be lossless.
 *
 * This file is PURE on purpose — no react-native imports (the type imports
 * below erase at compile time) and its own UTF-8 + base64, so it does not
 * care whether the JS runtime ships btoa, and the test suite can EXECUTE it
 * instead of reading it: the round-trip guards here are real, not textual.
 */
import type { RegionId } from './projection';
import type { RouteStop } from './routes';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    if (c > 0xffff) i++;                       // surrogate pair consumed
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function utf8String(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let c: number;
    if (b < 0x80) { c = b; i += 1; }
    else if (b < 0xe0) { c = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
    else if (b < 0xf0) {
      c = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    } else {
      c = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12)
        | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      i += 4;
    }
    out += String.fromCodePoint(c);
  }
  return out;
}

function toBase64(s: string): string {
  const bytes = utf8Bytes(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : ALPHABET[c & 63];
  }
  return out;
}

function fromBase64(s: string): string | null {
  const clean = s.replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return utf8String(bytes);
}

/** The exact text to put in the share sheet. */
export function encodeRoute(
  region: RegionId, regionName: string, stops: RouteStop[],
): string {
  const lines = stops.map((s, i) => `${i + 1}. ${s.label}`);
  const payload = toBase64(JSON.stringify({
    v: 1,
    region,
    stops: stops.map((s) => [s.u, s.v, s.label]),
  }));
  return [
    `Palforge route — ${regionName} — ${stops.length === 1 ? '1 stop' : `${stops.length} stops`}`,
    ...lines,
    `[palforge-route ${payload}]`,
  ].join('\n');
}

export type DecodedRoute =
  | { ok: true; region: RegionId; stops: Omit<RouteStop, 'region'>[] }
  | { ok: false; why: string };

/**
 * Find and validate a route in whatever text was pasted. Refusals are whole
 * and in plain language: a route with dropped stops is a DIFFERENT route,
 * so one bad row refuses the lot rather than salvaging the rest.
 */
export function decodeRoute(text: string): DecodedRoute {
  const m = /\[palforge-route ([A-Za-z0-9+/=]+)\]/.exec(text);
  if (!m) {
    return { ok: false, why: 'No Palforge route found in the copied text.' };
  }
  const damaged = {
    ok: false as const,
    why: 'This looks like a shared route, but it is damaged — ask your friend to share it again.',
  };
  const json = fromBase64(m[1]);
  if (json === null) return damaged;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return damaged;
  }
  if (typeof raw !== 'object' || raw === null) return damaged;
  const r = raw as { v?: unknown; region?: unknown; stops?: unknown };
  if (r.v !== 1) return damaged;
  if (r.region !== 'palpagos' && r.region !== 'tree') return damaged;
  if (!Array.isArray(r.stops) || r.stops.length === 0) return damaged;
  const stops: Omit<RouteStop, 'region'>[] = [];
  for (const row of r.stops) {
    if (!Array.isArray(row) || row.length !== 3) return damaged;
    const [u, v, label] = row as unknown[];
    if (typeof u !== 'number' || !(u >= 0 && u <= 1)) return damaged;
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) return damaged;
    if (typeof label !== 'string' || label.length === 0 || label.length > 40) return damaged;
    stops.push({ u, v, label });
  }
  return { ok: true, region: r.region, stops };
}
