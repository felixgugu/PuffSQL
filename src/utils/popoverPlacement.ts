/**
 * Placement maths for anchored overlays (popovers, menus).
 *
 * Kept pure and DOM-free so the tricky part — flipping above the trigger when there is no room
 * below, and clamping to the viewport so a panel near an edge stays fully visible — is unit
 * tested instead of being eyeballed.
 */

export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SizeLike {
  width: number;
  height: number;
}

export interface PlacePanelOptions {
  anchor: RectLike;
  panel: SizeLike;
  viewport: SizeLike;
  /** `start` aligns the panel's left edge with the trigger; `end` aligns the right edges. */
  align?: 'start' | 'end';
  /** Space kept between the panel and the viewport edges. */
  margin?: number;
  /** Space kept between the trigger and the panel. */
  gap?: number;
}

export function placePanel({
  anchor,
  panel,
  viewport,
  align = 'start',
  margin = 8,
  gap = 4,
}: PlacePanelOptions): { top: number; left: number } {
  const below = anchor.bottom + gap;
  const fitsBelow = below + panel.height <= viewport.height - margin;
  const preferredTop = fitsBelow ? below : anchor.top - panel.height - gap;

  const preferredLeft = align === 'end' ? anchor.right - panel.width : anchor.left;

  // A panel wider/taller than the viewport still starts at the margin instead of going negative.
  const maxTop = Math.max(margin, viewport.height - panel.height - margin);
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);

  return {
    top: Math.max(margin, Math.min(preferredTop, maxTop)),
    left: Math.max(margin, Math.min(preferredLeft, maxLeft)),
  };
}

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface PlaceTooltipOptions {
  anchor: RectLike;
  panel: SizeLike;
  viewport: SizeLike;
  /** Where the tooltip should sit relative to its trigger. */
  side: TooltipSide;
  /** Space kept between the tooltip and the viewport edges. */
  margin?: number;
  /** Space kept between the trigger and the tooltip. */
  gap?: number;
}

/**
 * Placement for the shared tooltip.
 *
 * A tooltip is centred on its trigger rather than edge-aligned, and it flips to the opposite side
 * when the requested one has no room — a `.top` tooltip on a button near the top of the window
 * would otherwise be clamped down on top of the very control it describes.
 */
export function placeTooltip({
  anchor,
  panel,
  viewport,
  side,
  margin = 8,
  gap = 6,
}: PlaceTooltipOptions): { top: number; left: number; side: TooltipSide } {
  const centreX = (anchor.left + anchor.right) / 2;
  const centreY = (anchor.top + anchor.bottom) / 2;
  const fitsAbove = anchor.top - panel.height - gap >= margin;
  const fitsBelow = anchor.bottom + panel.height + gap <= viewport.height - margin;

  let resolved = side;
  if (side === 'top' && !fitsAbove && fitsBelow) resolved = 'bottom';
  else if (side === 'bottom' && !fitsBelow && fitsAbove) resolved = 'top';

  let top = anchor.top - panel.height - gap;
  let left = centreX - panel.width / 2;

  if (resolved === 'bottom') top = anchor.bottom + gap;
  else if (resolved === 'left') {
    top = centreY - panel.height / 2;
    left = anchor.left - panel.width - gap;
  } else if (resolved === 'right') {
    top = centreY - panel.height / 2;
    left = anchor.right + gap;
  }

  const clamp = (value: number, extent: number) =>
    Math.max(margin, Math.min(value, Math.max(margin, extent - margin)));

  return {
    top: clamp(top, viewport.height - panel.height),
    left: clamp(left, viewport.width - panel.width),
    side: resolved,
  };
}
