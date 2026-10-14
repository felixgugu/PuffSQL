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
