/**
 * Colour maths for the transient "this just ran" highlight. The editor paints the executed
 * statement with it and the message log flashes the messages that arrive with it, so both
 * surfaces must derive their tints from the same setting the same way.
 */

/** Tint used when the configured value cannot be parsed as a colour. */
const FALLBACK_HIGHLIGHT = '#feffe0';

/** Wash over the highlighted surface. */
const HIGHLIGHT_BACKGROUND_ALPHA = 0.22;

/** Leading edge of the highlighted surface, matching the editor's decoration. */
const HIGHLIGHT_BORDER_ALPHA = 0.85;

/** Converts `#rgb` / `#rrggbb` into an `rgba()` string, falling back to the default tint. */
export function hexToRgba(hex: string, alpha: number): string {
  let cleanHex = (hex || '').replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const fallback = () => {
    const fallbackNum = parseInt(FALLBACK_HIGHLIGHT.replace('#', ''), 16);
    return `rgba(${(fallbackNum >> 16) & 255}, ${(fallbackNum >> 8) & 255}, ${fallbackNum & 255}, ${alpha})`;
  };
  if (cleanHex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return fallback();
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return fallback();
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Background + leading-edge tints of the transient highlight. */
export function transientHighlightColors(hex: string): { background: string; border: string } {
  return {
    background: hexToRgba(hex, HIGHLIGHT_BACKGROUND_ALPHA),
    border: hexToRgba(hex, HIGHLIGHT_BORDER_ALPHA),
  };
}
