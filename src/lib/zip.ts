/**
 * Minimal ZIP writer (store / no compression), dependency-free.
 *
 * Media files (JPEG, PNG, MP4…) are already compressed, so storing them
 * uncompressed produces an archive nearly as small as a deflated one while
 * keeping the app free of a third-party zip dependency. Handles UTF-8 file
 * names and the standard local-header / central-directory / EOCD layout.
 * 32-bit sizes only (no Zip64) — fine for cataloged photo and video files.
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Forward-slash path inside the archive, e.g. "Videos/Good Lighting/clip.mp4". */
  path: string;
  data: Uint8Array;
}

// Fixed DOS timestamp (2020-01-01 00:00:00) keeps archives deterministic.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

export function createStoreZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: UTF-8 filename
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);

    parts.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // flags: UTF-8
    cv.setUint16(10, 0, true); // method: store
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // disk with central dir
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true); // central dir size
  ev.setUint32(16, offset, true); // central dir offset
  ev.setUint16(20, 0, true); // comment length

  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
}
