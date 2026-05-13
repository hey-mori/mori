// Generates minimal valid placeholder icon assets for Tauri build readiness.
// This is not final branding — it produces a single solid Mori-tinted square
// in the formats tauri-build expects so cargo check and tauri build can run.
//
// Files produced:
//   src-tauri/icons/icon.ico          (Windows resource; required for cargo check)
//   src-tauri/icons/icon.png          (Source PNG used by tauri icon for re-gen)
//   src-tauri/icons/32x32.png         (Linux .desktop convention)
//   src-tauri/icons/128x128.png       (Linux .desktop convention)
//   src-tauri/icons/128x128@2x.png    (Linux .desktop convention)
//   src-tauri/icons/icon.icns         (macOS placeholder; minimal, not bundled by default)
//
// All bytes are written deterministically so re-running this script does not
// introduce diffs. To replace these with real branding, drop a 1024x1024 PNG
// at src-tauri/icons/icon.png and run `npm run tauri icon icons/icon.png`.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const COLOR = { r: 0x1f, g: 0x1f, b: 0x29, a: 0xff }; // dark indigo Mori tint
const OUT_DIR = path.join(__dirname, "..", "src-tauri", "icons");

let CRC_TABLE = null;

fs.mkdirSync(OUT_DIR, { recursive: true });

writePng(path.join(OUT_DIR, "icon.png"), 256, 256);
writePng(path.join(OUT_DIR, "32x32.png"), 32, 32);
writePng(path.join(OUT_DIR, "128x128.png"), 128, 128);
writePng(path.join(OUT_DIR, "128x128@2x.png"), 256, 256);
writeIco(path.join(OUT_DIR, "icon.ico"), 32);
writeIcnsPlaceholder(path.join(OUT_DIR, "icon.icns"));

console.log(`Wrote placeholder icons to ${OUT_DIR}`);

function writePng(outputPath, width, height) {
  const raw = solidRgba(width, height);
  const png = encodePng(width, height, raw);
  fs.writeFileSync(outputPath, png);
}

function solidRgba(width, height) {
  const buffer = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = COLOR.r;
    buffer[i + 1] = COLOR.g;
    buffer[i + 2] = COLOR.b;
    buffer[i + 3] = COLOR.a;
  }
  return buffer;
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const filtered = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    filtered[y * stride] = 0; // no filter
    rgba.copy(filtered, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const deflated = zlib.deflateSync(filtered);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflated),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeIco(outputPath, size) {
  // Single-image ICO using a BMP body so it is universally readable.
  const xorBytes = size * size * 4;
  const andBytes = (size * size) / 8;
  const dibSize = 40 + xorBytes + andBytes;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(1, 4); // image count

  const directory = Buffer.alloc(16);
  directory[0] = size === 256 ? 0 : size;
  directory[1] = size === 256 ? 0 : size;
  directory[2] = 0; // colors in palette
  directory[3] = 0; // reserved
  directory.writeUInt16LE(1, 4); // color planes
  directory.writeUInt16LE(32, 6); // bpp
  directory.writeUInt32LE(dibSize, 8); // bytes in resource
  directory.writeUInt32LE(6 + 16, 12); // offset

  const dib = Buffer.alloc(dibSize);
  dib.writeUInt32LE(40, 0); // header size
  dib.writeInt32LE(size, 4); // width
  dib.writeInt32LE(size * 2, 8); // height = 2 * size due to AND mask
  dib.writeUInt16LE(1, 12); // planes
  dib.writeUInt16LE(32, 14); // bpp
  dib.writeUInt32LE(0, 16); // BI_RGB
  dib.writeUInt32LE(0, 20); // size image
  dib.writeUInt32LE(0, 24); // x ppm
  dib.writeUInt32LE(0, 28); // y ppm
  dib.writeUInt32LE(0, 32); // colors used
  dib.writeUInt32LE(0, 36); // colors important

  // XOR mask: bottom-up rows of BGRA.
  for (let i = 0; i < xorBytes; i += 4) {
    dib[40 + i] = COLOR.b;
    dib[40 + i + 1] = COLOR.g;
    dib[40 + i + 2] = COLOR.r;
    dib[40 + i + 3] = COLOR.a;
  }
  // AND mask: all zero => visible.

  fs.writeFileSync(outputPath, Buffer.concat([header, directory, dib]));
}

function writeIcnsPlaceholder(outputPath) {
  // Minimal ICNS with one ic09 (512x512 PNG masked) entry. Apple icon utilities
  // expect a real PNG body; we embed the same solid PNG.
  const png = encodePng(64, 64, solidRgba(64, 64));
  const entryHeader = Buffer.alloc(8);
  entryHeader.write("ic07", 0, "ascii");
  entryHeader.writeUInt32BE(png.length + 8, 4);

  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, "ascii");
  fileHeader.writeUInt32BE(entryHeader.length + png.length + 8, 4);

  fs.writeFileSync(outputPath, Buffer.concat([fileHeader, entryHeader, png]));
}
