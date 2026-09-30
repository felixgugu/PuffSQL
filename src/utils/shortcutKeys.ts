/**
 * Keyboard-shortcut label helpers.
 *
 * The shortcut hints shown in the UI (empty states, settings) must name the modifier the user
 * actually has on their keyboard, otherwise a macOS user reads "Ctrl + Enter" and presses the
 * wrong chord. Kept as pure string functions with the user agent passed in, so `utils/` stays free
 * of DOM access and the labels can be unit tested.
 */

/** True for macOS user agents; anything unknown is treated as Ctrl. */
export function isMacUserAgent(userAgent: string | null | undefined): boolean {
  return /Macintosh|Mac OS X/i.test(userAgent ?? '');
}

/** The platform's command modifier as it is printed on keycaps: `⌘` or `Ctrl`. */
export function modifierLabel(userAgent: string | null | undefined): string {
  return isMacUserAgent(userAgent) ? '⌘' : 'Ctrl';
}

/** Joins the command modifier with the rest of a shortcut, e.g. `Ctrl + Enter` or `⌘ + Enter`. */
export function shortcutLabel(
  keys: string,
  userAgent: string | null | undefined
): string {
  return `${modifierLabel(userAgent)} + ${keys}`;
}
