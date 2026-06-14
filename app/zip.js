// Dependency-vrije ZIP-writer (alleen "store", geen compressie — de JPEG's zijn
// al klein). Node ≥18 heeft geen ingebouwde zip-schrijver en geen zlib.crc32,
// dus CRC-32 zit hieronder met een eigen lookup-tabel.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: string, data: Buffer }] -> één Buffer met de complete zip.
export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);      // local file header signature
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // flags: bit 11 = UTF-8 naam
    local.writeUInt16LE(0, 8);               // method: store
    local.writeUInt16LE(0, 10);              // mod time
    local.writeUInt16LE(0, 12);              // mod date
    local.writeUInt32LE(crc, 14);            // crc-32
    local.writeUInt32LE(data.length, 18);    // compressed size
    local.writeUInt32LE(data.length, 22);    // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // naamlengte
    local.writeUInt16LE(0, 28);              // extra length
    parts.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);        // central directory header signature
    cen.writeUInt16LE(20, 4);                // version made by
    cen.writeUInt16LE(20, 6);                // version needed
    cen.writeUInt16LE(0x0800, 8);            // flags
    cen.writeUInt16LE(0, 10);                // method
    cen.writeUInt16LE(0, 12);                // mod time
    cen.writeUInt16LE(0, 14);                // mod date
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);                // extra length
    cen.writeUInt16LE(0, 32);                // comment length
    cen.writeUInt16LE(0, 34);                // disk number
    cen.writeUInt16LE(0, 36);                // internal attrs
    cen.writeUInt32LE(0, 38);                // external attrs
    cen.writeUInt32LE(offset, 42);           // offset local header
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);          // end of central directory signature
  end.writeUInt16LE(0, 4);                   // disk nr
  end.writeUInt16LE(0, 6);                   // disk met central dir
  end.writeUInt16LE(files.length, 8);        // entries op deze disk
  end.writeUInt16LE(files.length, 10);       // totaal entries
  end.writeUInt32LE(centralBuf.length, 12);  // central dir grootte
  end.writeUInt32LE(offset, 16);             // central dir offset
  end.writeUInt16LE(0, 20);                  // comment length

  return Buffer.concat([...parts, centralBuf, end]);
}
