import { crc32, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { decodePng, pngsMatch } from "./png-pixels";

type Filter = 0 | 1 | 2 | 3 | 4;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Encodes an 8-bit, non-interlaced PNG, filtering row `y` with
 * `filters[y % filters.length]` so the decoder meets every filter type.
 */
function encodePng(
  width: number,
  height: number,
  pixels: number[],
  options: { channels?: 3 | 4; filters?: Filter[] } = {},
): Buffer {
  const channels = options.channels ?? 4;
  const filters = options.filters ?? [0];
  const stride = width * channels;
  const raw: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const filter = filters[y % filters.length] ?? 0;
    raw.push(filter);
    for (let x = 0; x < stride; x += 1) {
      const at = (row: number, col: number): number =>
        row < 0 || col < 0 ? 0 : (pixels[row * stride + col] ?? 0);
      const value = at(y, x);
      const left = at(y, x - channels);
      const up = at(y - 1, x);
      const upLeft = at(y - 1, x - channels);
      const predictor = [
        0,
        left,
        up,
        Math.floor((left + up) / 2),
        paeth(left, up, upLeft),
      ][filter] as number;
      raw.push((value - predictor + 256) % 256);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(channels === 4 ? 6 : 2, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A 3×5 RGBA image whose values vary enough for every filter to matter. */
const WIDTH = 3;
const HEIGHT = 5;
const PIXELS = Array.from(
  { length: WIDTH * HEIGHT * 4 },
  (_, index) => (index * 37 + 11) % 256,
);

describe("decodePng", () => {
  it("returns the RGBA pixels of an unfiltered image", () => {
    const image = decodePng(encodePng(WIDTH, HEIGHT, PIXELS));
    expect(image.width).toBe(WIDTH);
    expect(image.height).toBe(HEIGHT);
    expect(Array.from(image.rgba)).toEqual(PIXELS);
  });

  it("reverses the Sub, Up, Average and Paeth filters", () => {
    const image = decodePng(
      encodePng(WIDTH, HEIGHT, PIXELS, { filters: [0, 1, 2, 3, 4] }),
    );
    expect(Array.from(image.rgba)).toEqual(PIXELS);
  });

  it("widens an RGB image to opaque RGBA", () => {
    const rgb = [10, 20, 30, 40, 50, 60];
    const image = decodePng(encodePng(2, 1, rgb, { channels: 3 }));
    expect(Array.from(image.rgba)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("refuses bytes that are not a PNG", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow();
  });
});

describe("pngsMatch", () => {
  const original = encodePng(WIDTH, HEIGHT, PIXELS);

  it("matches an image against itself", () => {
    expect(pngsMatch(original, original, 2)).toBe(true);
  });

  it("matches the same pixels filtered differently", () => {
    const refiltered = encodePng(WIDTH, HEIGHT, PIXELS, { filters: [4, 1] });
    expect(pngsMatch(original, refiltered, 0)).toBe(true);
  });

  it("matches when every channel differs by no more than the tolerance", () => {
    const nudged = PIXELS.map((value) => (value >= 2 ? value - 2 : value + 2));
    expect(pngsMatch(original, encodePng(WIDTH, HEIGHT, nudged), 2)).toBe(true);
  });

  it("rejects a single channel that differs by more than the tolerance", () => {
    const shifted = [...PIXELS];
    shifted[7] = ((shifted[7] ?? 0) + 3) % 256;
    expect(pngsMatch(original, encodePng(WIDTH, HEIGHT, shifted), 2)).toBe(
      false,
    );
  });

  it("rejects images of different sizes", () => {
    const smaller = encodePng(
      WIDTH,
      HEIGHT - 1,
      PIXELS.slice(0, WIDTH * 4 * 4),
    );
    expect(pngsMatch(original, smaller, 2)).toBe(false);
  });
});
