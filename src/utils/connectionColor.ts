/**
 * Colour helpers for user-chosen connection labels.
 *
 * The preset palette (and any custom picker value) is tuned for dark surfaces: on a light
 * surface the vivid 400/500 steps only reach roughly 1.9-4.0:1, which made connection names
 * unreadable in light mode. These pure helpers keep the stored colour untouched and only adjust
 * the value that is rendered.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Panel background in the light palette (`--color-dark-800`: near-white, not pure white). */
const DEFAULT_LIGHT_SURFACE = '#fcfdfe';
const MIN_TEXT_CONTRAST = 4.5;

export function parseHexColor(input: string | undefined | null): RgbColor | null {
  if (!input) return null;
  const value = input.trim().replace(/^#/, '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

export function toHexColor(rgb: RgbColor): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

export function relativeLuminance(rgb: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(foreground: RgbColor, background: RgbColor): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function mixRgb(base: RgbColor, target: RgbColor, ratio: number): RgbColor {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    r: base.r * (1 - clamped) + target.r * clamped,
    g: base.g * (1 - clamped) + target.g * clamped,
    b: base.b * (1 - clamped) + target.b * clamped,
  };
}

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const WHITE_TEXT = '#ffffff';
const NEAR_BLACK_TEXT = '#0f172a';

/**
 * Picks the text colour (white or near-black) with the higher contrast against `background`.
 * Used for colour swatches whose background is user-configurable.
 */
export function pickReadableTextColor(
  background: string,
  light = WHITE_TEXT,
  dark = NEAR_BLACK_TEXT
): string {
  const bg = parseHexColor(background);
  if (!bg) return light;
  const lightRgb = parseHexColor(light)!;
  const darkRgb = parseHexColor(dark)!;
  return contrastRatio(lightRgb, bg) >= contrastRatio(darkRgb, bg) ? light : dark;
}

/**
 * Returns a display colour for a connection label.
 *
 * Dark mode returns the stored colour unchanged. Light mode darkens it towards black in 5%
 * steps until it clears 4.5:1 against `surface`, keeping the hue recognisable.
 */
export function resolveConnectionLabelColor(
  color: string | undefined | null,
  mode: 'dark' | 'light',
  surface: string = DEFAULT_LIGHT_SURFACE
): string | undefined {
  const parsed = parseHexColor(color);
  if (!parsed) return color ?? undefined;
  if (mode === 'dark') return color ?? undefined;

  const bg = parseHexColor(surface) ?? parseHexColor(DEFAULT_LIGHT_SURFACE)!;
  if (contrastRatio(parsed, bg) >= MIN_TEXT_CONTRAST) return toHexColor(parsed);

  for (let ratio = 0.05; ratio <= 0.6; ratio += 0.05) {
    const candidate = mixRgb(parsed, BLACK, ratio);
    if (contrastRatio(candidate, bg) >= MIN_TEXT_CONTRAST) return toHexColor(candidate);
  }
  return toHexColor(mixRgb(parsed, BLACK, 0.6));
}
