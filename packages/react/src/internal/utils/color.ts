export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export const NAMED_PALETTES = {
  browserbase: ["#eff2dc", "#b7c7da", "#4874b7", "#172033"],
  mono: ["#000000", "#ffffff"]
} as const;

const HEX_COLOR_PATTERN = /^#(?<hex>[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

export function parseColor(input: string): RgbaColor {
  const match = HEX_COLOR_PATTERN.exec(input.trim());
  const hex = match?.groups?.hex;

  if (!hex) {
    throw new Error(
      `Invalid color "${input}". Use #rgb, #rgba, #rrggbb, or #rrggbbaa.`
    );
  }

  if (hex.length === 3 || hex.length === 4) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) : 255
    };
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255
  };
}

export function serializeColor(color: RgbaColor): [number, number, number, number] {
  return [toByte(color.r), toByte(color.g), toByte(color.b), toByte(color.a)];
}

export function resolvePalette(
  palette: readonly string[] | "mono" | "browserbase" | "source" | undefined
): RgbaColor[] | "source" {
  if (!palette || palette === "browserbase") {
    return NAMED_PALETTES.browserbase.map(parseColor);
  }

  if (palette === "mono") {
    return NAMED_PALETTES.mono.map(parseColor);
  }

  if (palette === "source") {
    return "source";
  }

  if (palette.length === 0) {
    throw new Error("Palette must contain at least one color.");
  }

  return palette.map(parseColor);
}

export function findNearestPaletteColor(
  color: RgbaColor,
  palette: readonly RgbaColor[]
): RgbaColor {
  if (palette.length === 0) {
    throw new Error("Palette must contain at least one color.");
  }

  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const distance =
      (color.r - candidate.r) ** 2 +
      (color.g - candidate.g) ** 2 +
      (color.b - candidate.b) ** 2 +
      ((color.a - candidate.a) ** 2) * 0.25;

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function mixColors(from: RgbaColor, to: RgbaColor, amount: number): RgbaColor {
  const t = clamp01(amount);

  return {
    r: lerp(from.r, to.r, t),
    g: lerp(from.g, to.g, t),
    b: lerp(from.b, to.b, t),
    a: lerp(from.a, to.a, t)
  };
}

export function toByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
