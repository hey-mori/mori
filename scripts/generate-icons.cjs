// Generates Mori's production icon assets from the same vector geometry used
// by the React/SVG brand mark.
//
// Files produced:
//   public/apple-touch-icon.png
//   src-tauri/icons/icon.png          (1024x1024 source with alpha corners)
//   src-tauri/icons/32x32.png
//   src-tauri/icons/128x128.png
//   src-tauri/icons/128x128@2x.png
//   src-tauri/icons/icon.ico
//   src-tauri/icons/icon.icns

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "src-tauri", "icons");
const VIEWBOX = 1024;
const TILE_RADIUS = 152;
const NATIVE_ICON_INSET_RATIO = 0.075;

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

const STAR_POLYGON = flattenPath(STAR_SEGMENTS, 18);

let CRC_TABLE = null;
const pngCache = new Map();

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

writePng(path.join(PUBLIC_DIR, "apple-touch-icon.png"), 180);
writePng(path.join(OUT_DIR, "icon.png"), 1024, NATIVE_ICON_INSET_RATIO);
writePng(path.join(OUT_DIR, "32x32.png"), 32, NATIVE_ICON_INSET_RATIO);
writePng(path.join(OUT_DIR, "128x128.png"), 128, NATIVE_ICON_INSET_RATIO);
writePng(path.join(OUT_DIR, "128x128@2x.png"), 256, NATIVE_ICON_INSET_RATIO);
writeIco(path.join(OUT_DIR, "icon.ico"), [16, 32, 48, 64, 128, 256], NATIVE_ICON_INSET_RATIO);
writeIcns(path.join(OUT_DIR, "icon.icns"), NATIVE_ICON_INSET_RATIO);

console.log(`Wrote Mori icon assets to ${OUT_DIR}`);

function writePng(outputPath, size, insetRatio = 0) {
  fs.writeFileSync(outputPath, pngForSize(size, insetRatio));
}

function pngForSize(size, insetRatio = 0) {
  const key = `${size}:${insetRatio}`;

  if (!pngCache.has(key)) {
    pngCache.set(key, encodePng(size, size, renderIcon(size, insetRatio)));
  }

  return pngCache.get(key);
}

function renderIcon(size, insetRatio) {
  const samples = size <= 64 ? 4 : size <= 256 ? 3 : 2;
  const sampleCount = samples * samples;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = ((x + (sx + 0.5) / samples) / size) * VIEWBOX;
          const py = ((y + (sy + 0.5) / samples) / size) * VIEWBOX;
          const color = colorAtExport(px, py, insetRatio);

          pr += color.r * color.a;
          pg += color.g * color.a;
          pb += color.b * color.a;
          pa += color.a;
        }
      }

      const alpha = pa / sampleCount;
      const i = (y * size + x) * 4;
      rgba[i] = alpha > 0 ? Math.round(pr / pa) : 0;
      rgba[i + 1] = alpha > 0 ? Math.round(pg / pa) : 0;
      rgba[i + 2] = alpha > 0 ? Math.round(pb / pa) : 0;
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }

  return rgba;
}

function colorAtExport(x, y, insetRatio) {
  if (insetRatio === 0) {
    return colorAt(x, y);
  }

  const inset = VIEWBOX * insetRatio;
  const contentSize = VIEWBOX - inset * 2;

  if (x < inset || x > VIEWBOX - inset || y < inset || y > VIEWBOX - inset) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return colorAt(((x - inset) / contentSize) * VIEWBOX, ((y - inset) / contentSize) * VIEWBOX);
}

function colorAt(x, y) {
  if (!insideRoundedRect(x, y, VIEWBOX, VIEWBOX, TILE_RADIUS)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  let color = gradientColor((x + y) / (VIEWBOX * 2));

  if (pointInPolygon(x, y, BEAM_POLYGON)) {
    const beamAlpha = 0.18 + 0.2 * clamp((y - 500) / (VIEWBOX - 500));
    color = blend(color, { r: 255, g: 255, b: 255, a: beamAlpha });
  }

  if (pointInPolygon(x, y, STAR_POLYGON)) {
    color = blend(color, { r: 255, g: 255, b: 255, a: 1 });
  }

  return color;
}

function insideRoundedRect(x, y, width, height, radius) {
  if (x < 0 || x > width || y < 0 || y > height) {
    return false;
  }

  const cx = clampToRange(x, radius, width - radius);
  const cy = clampToRange(y, radius, height - radius);
  const dx = x - cx;
  const dy = y - cy;

  return dx * dx + dy * dy <= radius * radius;
}

function gradientColor(t) {
  const stopIndex = TILE_STOPS.findIndex((stop) => t <= stop.t);
  const upper = TILE_STOPS[Math.max(1, stopIndex)];
  const lower = TILE_STOPS[TILE_STOPS.indexOf(upper) - 1];
  const span = upper.t - lower.t || 1;
  const localT = clamp((t - lower.t) / span);
  const color = [
    lerp(lower.color[0], upper.color[0], localT),
    lerp(lower.color[1], upper.color[1], localT),
    lerp(lower.color[2], upper.color[2], localT),
  ];

  return { r: color[0], g: color[1], b: color[2], a: 1 };
}

function blend(dst, src) {
  const outA = src.a + dst.a * (1 - src.a);
  if (outA === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
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

function writeIco(outputPath, sizes, insetRatio = 0) {
  const images = sizes.map((size) => ({ size, png: pngForSize(size, insetRatio) }));
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
    directory.writeUInt32LE(image.png.length, 8);
    directory.writeUInt32LE(offset, 12);
    directories.push(directory);
    offset += image.png.length;
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, ...directories, ...images.map((image) => image.png)]));
}

function writeIcns(outputPath, insetRatio = 0) {
  const entries = [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ].map(([type, size]) => {
    const png = pngForSize(size, insetRatio);
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + header.length, 4);
    return Buffer.concat([header, png]);
  });

  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(header.length + entries.reduce((sum, entry) => sum + entry.length, 0), 4);

  fs.writeFileSync(outputPath, Buffer.concat([header, ...entries]));
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function clampToRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, t) {
  return Math.round(start + (end - start) * t);
}
