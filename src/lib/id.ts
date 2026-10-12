/**
 * Generates an RFC 4122 v4 UUID.
 *
 * `crypto.randomUUID()` only exists in a **secure context** — HTTPS or
 * `localhost`. When the app is opened from a phone against the dev server over
 * a plain-HTTP LAN address (e.g. `http://192.168.1.5:5173`), that context is
 * insecure and `crypto.randomUUID` is `undefined`, which threw
 * "crypto.randomUUID is not a function" during upload.
 *
 * `crypto.getRandomValues()` is available in insecure contexts too, so we use
 * it to build a proper v4 UUID when the native helper is missing, and fall back
 * to `Math.random()` only if even that is unavailable.
 */
export function uuid(): string {
  const c: Crypto | undefined = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set the version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
