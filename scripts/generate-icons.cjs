// Generates Mori's production app-icon assets from the same vector geometry
// used by the React/SVG brand mark (a guiding star over a soft focus beam on a
// purple-gradient tile).
//
// The packaged app icon is NOT the same composition as the in-product CSS mark:
// each platform gets a native treatment so the icon reads correctly in the Dock,
// the taskbar, the app switcher, the installer, and File Explorer.
//
//   - macOS  (.icns)            squircle tile + ~9.8% safe-area margin (Apple grid).
//   - Windows (.ico)            near-full-bleed tile; small sizes drop the beam and
//                               enlarge the star so 16/20/24px stay legible; BMP
//                               entries below 256px for maximum Explorer compatibility.
//   - Linux / generic (.png)    balanced margin; small sizes simplify like Windows.
//   - iOS web-clip              full-bleed opaque square (iOS applies its own mask).
//
// Dependency-free on purpose: this must run anywhere Node runs (incl. CI).
//
// Files produced:
//   public/apple-touch-icon.png
//   src-tauri/icons/icon.png          (1024 macOS-style source)
//   src-tauri/icons/32x32.png
//   src-tauri/icons/128x128.png
//   src-tauri/icons/128x128@2x.png
//   src-tauri/icons/icon.ico          (16/20/24/32/40/48/64/128 BMP + 256 PNG)
//   src-tauri/icons/icon.icns         (retina-complete PNG entries)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "src-tauri", "icons");

// Content space. The star/beam/gradient are authored in this 1024 box; a tile is
// then placed inside the output canvas with a platform-specific margin + corner.
const VIEWBOX = 1024;

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

const TILE_STOPS = [
  { t: 0, color: [0x5c, 0x52, 0xf4] },
  { t: 0.55, color: [0x71, 0x5d, 0xeb] },
  { t: 1, color: [0xaa, 0x86, 0xf5] },
];

const BEAM_POLYGON = [
  [274, 1024],
  [414, 610],
  [512, 685],
  [610, 610],
  [750, 1024],
];

const STAR_SEGMENTS = [
  ["M", 512, 226],
  ["C", 552, 226, 566, 263, 584, 337],
  ["C", 606, 428, 638, 462, 722, 485],
  ["C", 787, 502, 806, 517, 806, 536],
  ["C", 806, 561, 775, 572, 714, 588],
  ["C", 630, 610, 601, 643, 579, 734],
  ["C", 561, 808, 552, 836, 512, 836],
  ["C", 472, 836, 463, 808, 445, 734],
  ["C", 423, 643, 394, 610, 310, 588],
  ["C", 249, 572, 218, 561, 218, 536],
  ["C", 218, 517, 237, 502, 302, 485],
  ["C", 386, 462, 418, 428, 440, 337],
  ["C", 458, 263, 472, 226, 512, 226],
  ["Z"],
];

const STAR_POLYGON = flattenPath(STAR_SEGMENTS, 22);
// The star's vertical extent is 226..836 (centre 531); the beam fills the space
// below it. When the beam is dropped at small sizes we recentre the star.
const STAR_CENTER = [512, 531];
const STAR_RECENTER_SHIFT = 512 - STAR_CENTER[1];

// Platform compositions. `margin` is the transparent inset as a fraction of the
// canvas on each side; `radiusRatio` is the corner radius as a fraction of the
// (post-margin) tile side; `exp` is the superellipse exponent (2 = circular
// arc, ~4-5 = Apple-style continuous "squircle" corner).
const MAC = { margin: 0.098, radiusRatio: 0.225, exp: 5 };
const GENERIC = { margin: 0.07, radiusRatio: 0.2, exp: 4 };
const FULL_BLEED = { fullBleed: true };

function windowsProfile(size) {
  // Windows does not mask icons, so the tile fills most of the frame. Small
  // sizes hug the edge harder so the taskbar/Explorer icon never looks tiny.
  return { margin: size < 48 ? 0.035 : 0.06, radiusRatio: size < 48 ? 0.17 : 0.2, exp: 4 };
}

// Level-of-detail by final display size, independent of platform.
const BEAM_MIN_SIZE = 64; // below this the beam turns to mud — drop it.

// ICO entries at/above this size are PNG-compressed; smaller entries are BMP.
const ICO_PNG_MIN_SIZE = 128;

function starScaleFor(size) {
  if (size <= 20) return 1.16;
  if (size <= 32) return 1.08;
  return 1;
}

let CRC_TABLE = null;
const rgbaCache = new Map();
const pngCache = new Map();

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

writePng(path.join(PUBLIC_DIR, "apple-touch-icon.png"), 180, FULL_BLEED);
writePng(path.join(OUT_DIR, "icon.png"), 1024, MAC);
writePng(path.join(OUT_DIR, "32x32.png"), 32, GENERIC);
writePng(path.join(OUT_DIR, "128x128.png"), 128, GENERIC);
writePng(path.join(OUT_DIR, "128x128@2x.png"), 256, GENERIC);
writeIco(path.join(OUT_DIR, "icon.ico"), [16, 20, 24, 32, 40, 48, 64, 128, 256], windowsProfile);
writeIcns(path.join(OUT_DIR, "icon.icns"), MAC);

console.log(`Wrote Mori icon assets to ${OUT_DIR}`);

// --- output helpers --------------------------------------------------------

function writePng(outputPath, size, profile) {
  fs.writeFileSync(outputPath, pngForSize(size, profile));
}

function rgbaForSize(size, profile) {
  const key = `${size}:${profileKey(profile)}`;
  if (!rgbaCache.has(key)) {
    rgbaCache.set(key, renderIcon(size, profile));
  }
  return rgbaCache.get(key);
}

function pngForSize(size, profile) {
  const key = `${size}:${profileKey(profile)}`;
  if (!pngCache.has(key)) {
    pngCache.set(key, encodePng(size, size, rgbaForSize(size, profile)));
  }
  return pngCache.get(key);
}

function profileKey(profile) {
  return profile.fullBleed ? "full" : `${profile.margin}|${profile.radiusRatio}|${profile.exp}`;
}

// --- rasteriser ------------------------------------------------------------

function renderIcon(size, profile) {
  const samples = clampInt(Math.round(768 / size), 2, 24);
  const sampleCount = samples * samples;
  const beamOn = size >= BEAM_MIN_SIZE;
  const starPolygon = starPolygonFor(starScaleFor(size), beamOn ? 0 : STAR_RECENTER_SHIFT);
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const cx = ((x + (sx + 0.5) / samples) / size) * VIEWBOX;
          const cy = ((y + (sy + 0.5) / samples) / size) * VIEWBOX;
          const color = pixelColor(cx, cy, profile, beamOn, starPolygon);

          pr += color.r * color.a;
          pg += color.g * color.a;
          pb += color.b * color.a;
          pa += color.a;
        }
      }

      const alpha = pa / sampleCount;
      const i = (y * size + x) * 4;
      rgba[i] = pa > 0 ? Math.round(pr / pa) : 0;
      rgba[i + 1] = pa > 0 ? Math.round(pg / pa) : 0;
      rgba[i + 2] = pa > 0 ? Math.round(pb / pa) : 0;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }

  return rgba;
}

// Maps a canvas point (0..VIEWBOX) onto the tile, returning the composited color.
function pixelColor(cx, cy, profile, beamOn, starPolygon) {
  let u;
  let v;

  if (profile.fullBleed) {
    if (cx < 0 || cx > VIEWBOX || cy < 0 || cy > VIEWBOX) {
      return TRANSPARENT;
    }
    u = cx;
    v = cy;
  } else {
    const m = VIEWBOX * profile.margin;
    const side = VIEWBOX - 2 * m;
    const r = side * profile.radiusRatio;

    if (!insideSquircle(cx, cy, m, m, VIEWBOX - m, VIEWBOX - m, r, profile.exp)) {
      return TRANSPARENT;
    }

    u = ((cx - m) / side) * VIEWBOX;
    v = ((cy - m) / side) * VIEWBOX;
  }

  let color = gradientColor((u + v) / (VIEWBOX * 2));

  if (beamOn && pointInPolygon(u, v, BEAM_POLYGON)) {
    const beamAlpha = 0.18 + 0.2 * clamp((v - 500) / (VIEWBOX - 500));
    color = blend(color, { r: 255, g: 255, b: 255, a: beamAlpha });
  }

  if (pointInPolygon(u, v, starPolygon)) {
    color = { r: 255, g: 255, b: 255, a: 1 };
  }

  return color;
}

// Superellipse-cornered rounded rectangle. exp=2 is a circular arc; higher
// exponents give the continuous-corner "squircle" macOS uses.
function insideSquircle(x, y, x0, y0, x1, y1, r, exp) {
  if (x < x0 || x > x1 || y < y0 || y > y1) {
    return false;
  }

  const qx = clampToRange(x, x0 + r, x1 - r);
  const qy = clampToRange(y, y0 + r, y1 - r);
  const dx = Math.abs(x - qx) / r;
  const dy = Math.abs(y - qy) / r;

  if (dx === 0 || dy === 0) {
    return true;
  }

  return Math.pow(dx, exp) + Math.pow(dy, exp) <= 1;
}

function starPolygonFor(scale, shiftY) {
  return STAR_POLYGON.map(([px, py]) => [
    STAR_CENTER[0] + (px - STAR_CENTER[0]) * scale,
    STAR_CENTER[1] + (py - STAR_CENTER[1]) * scale + shiftY,
  ]);
}

function gradientColor(t) {
  const stopIndex = TILE_STOPS.findIndex((stop) => t <= stop.t);
  const upper = TILE_STOPS[Math.max(1, stopIndex)];
  const lower = TILE_STOPS[TILE_STOPS.indexOf(upper) - 1];
  const span = upper.t - lower.t || 1;
  const localT = clamp((t - lower.t) / span);

  return {
    r: lerp(lower.color[0], upper.color[0], localT),
    g: lerp(lower.color[1], upper.color[1], localT),
    b: lerp(lower.color[2], upper.color[2], localT),
    a: 1,
  };
}

function blend(dst, src) {
  const outA = src.a + dst.a * (1 - src.a);
  if (outA === 0) {
    return TRANSPARENT;
  }

  return {
    r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / outA,
    g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / outA,
    b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / outA,
    a: outA,
  };
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function flattenPath(segments, steps) {
  const points = [];
  let current = [0, 0];
  let start = [0, 0];

  for (const segment of segments) {
    if (segment[0] === "M") {
      current = [segment[1], segment[2]];
      start = current;
      points.push(current);
    }

    if (segment[0] === "C") {
      const p0 = current;
      const p1 = [segment[1], segment[2]];
      const p2 = [segment[3], segment[4]];
      const p3 = [segment[5], segment[6]];

      for (let i = 1; i <= steps; i += 1) {
        points.push(cubicPoint(p0, p1, p2, p3, i / steps));
      }

      current = p3;
    }

    if (segment[0] === "Z") {
      current = start;
    }
  }

  return points;
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return [
    mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
    mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// --- PNG encoding ----------------------------------------------------------

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const filtered = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    filtered[y * stride] = 0;
    rgba.copy(filtered, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(filtered, { level: 9 })),
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

// --- ICO encoding ----------------------------------------------------------

// Small sizes (<=64px) are stored as uncompressed BMP/DIB entries; some Windows
// shell surfaces (small Explorer views, legacy code paths) render PNG-in-ICO
// poorly at those sizes, so BMP is the safe choice. 128/256 stay PNG — they only
// appear in large views that handle PNG fine, and PNG keeps the file small.
function writeIco(outputPath, sizes, profileFn) {
  const images = sizes.map((size) => {
    const profile = profileFn(size);
    const data =
      size >= ICO_PNG_MIN_SIZE
        ? pngForSize(size, profile)
        : encodeBmpEntry(size, rgbaForSize(size, profile));
    return { size, data };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directories = [];
  let offset = header.length + images.length * 16;

  for (const image of images) {
    const directory = Buffer.alloc(16);
    directory[0] = image.size >= 256 ? 0 : image.size;
    directory[1] = image.size >= 256 ? 0 : image.size;
    directory[2] = 0;
    directory[3] = 0;
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(image.data.length, 8);
    directory.writeUInt32LE(offset, 12);
    directories.push(directory);
    offset += image.data.length;
  }

  fs.writeFileSync(
    outputPath,
    Buffer.concat([header, ...directories, ...images.map((image) => image.data)]),
  );
}

// 32bpp bottom-up BGRA DIB with a derived 1-bit AND mask, per the ICO spec.
function encodeBmpEntry(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // colour data + AND mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const srcRow = (size - 1 - y) * size * 4; // bottom-up
    const dstRow = y * size * 4;
    for (let x = 0; x < size; x += 1) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      pixels[d] = rgba[s + 2]; // B
      pixels[d + 1] = rgba[s + 1]; // G
      pixels[d + 2] = rgba[s]; // R
      pixels[d + 3] = rgba[s + 3]; // A
    }
  }

  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size);
  for (let y = 0; y < size; y += 1) {
    const srcRow = (size - 1 - y) * size * 4;
    const dstRow = y * maskRowBytes;
    for (let x = 0; x < size; x += 1) {
      if (rgba[srcRow + x * 4 + 3] < 128) {
        mask[dstRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

// --- ICNS encoding ---------------------------------------------------------

// Retina-complete: each logical size is emitted under both its 1x and the
// matching @2x OSType so macOS can pick the right asset at any scale factor.
function writeIcns(outputPath, profile) {
  const entries = [
    ["icp4", 16],
    ["ic11", 32],
    ["icp5", 32],
    ["ic12", 64],
    ["ic07", 128],
    ["ic13", 256],
    ["ic08", 256],
    ["ic14", 512],
    ["ic09", 512],
    ["ic10", 1024],
  ].map(([type, size]) => {
    const png = pngForSize(size, profile);
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + header.length, 4);
    return Buffer.concat([header, png]);
  });

  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(
    header.length + entries.reduce((sum, entry) => sum + entry.length, 0),
    4,
  );

  fs.writeFileSync(outputPath, Buffer.concat([header, ...entries]));
}

// --- math ------------------------------------------------------------------

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function clampToRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, t) {
  return Math.round(start + (end - start) * t);
}
