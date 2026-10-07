import { inflateSync } from "node:zlib";

/**
 * Just enough of a PNG decoder to compare two rasterised icons by pixel:
 * 8-bit, non-interlaced, RGB or RGBA — what Chromium's `capturePage` writes.
 */

export interface DecodedPng {
  width: number;
  height: number;
  /** Four bytes per pixel; RGB input is widened with an opaque alpha. */
  rgba: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPE_RGB = 2;
const COLOUR_TYPE_RGBA = 6;

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

export function decodePng(bytes: Buffer): DecodedPng {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG: bad signature");
  }

  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colourType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (
        bitDepth !== 8 ||
        interlace !== 0 ||
        (colourType !== COLOUR_TYPE_RGB && colourType !== COLOUR_TYPE_RGBA)
      ) {
        throw new Error(
          `unsupported PNG: depth ${String(bitDepth)}, colour type ${String(colourType)}, interlace ${String(interlace)}`,
        );
      }
      channels = colourType === COLOUR_TYPE_RGBA ? 4 : 3;
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    // Length, type, data, CRC.
    offset += 12 + length;
  }
  if (channels === 0) throw new Error("not a PNG: no IHDR chunk");

  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x] ?? 0;
      const left = x >= channels ? (pixels[row + x - channels] ?? 0) : 0;
      const up = y > 0 ? (pixels[row - stride + x] ?? 0) : 0;
      const upLeft =
        y > 0 && x >= channels ? (pixels[row - stride + x - channels] ?? 0) : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = Math.floor((left + up) / 2);
          break;
        case 4:
          predictor = paeth(left, up, upLeft);
          break;
        default:
          throw new Error(
            `unknown PNG filter ${String(filter)} on row ${String(y)}`,
          );
      }
      pixels[row + x] = (value + predictor) & 0xff;
    }
  }

  if (channels === 4) return { width, height, rgba: pixels };
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba.set(pixels.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
    rgba[pixel * 4 + 3] = 0xff;
  }
  return { width, height, rgba };
}

/**
 * True when both PNGs have the same size and no channel of any pixel differs
 * by more than `tolerance`.
 */
export function pngsMatch(a: Buffer, b: Buffer, tolerance: number): boolean {
  const first = decodePng(a);
  const second = decodePng(b);
  if (first.width !== second.width || first.height !== second.height) {
    return false;
  }
  return first.rgba.every(
    (value, index) => Math.abs(value - (second.rgba[index] ?? 0)) <= tolerance,
  );
}
