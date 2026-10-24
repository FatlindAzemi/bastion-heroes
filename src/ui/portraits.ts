/**
 * Portrait lookup for the M3 card visuals (spec 9.8, issue #66/#76).
 *
 * The M3 art pipeline writes head-and-shoulders portraits to
 * `public/portraits/<defenderId>.webp`. Vite resolves the portraits that exist
 * at build time, so a portrait that has not been generated yet never causes a
 * 404 request: the card falls back to its faction gradient. The pilot portraits
 * of issue #66 are picked up automatically; the rest arrive with the M3 art
 * pipeline and the module list grows on the next build.
 */
const PORTRAIT_MODULES: Readonly<Record<string, string>> = import.meta.glob<string>(
  '/public/portraits/*.webp',
  { eager: true, query: '?url', import: 'default' },
);

/** Extracts the defender id from a glob path like `/public/portraits/glowshroom_monk.webp`. */
function portraitIdFromPath(path: string): string | null {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return fileName.endsWith('.webp') ? fileName.slice(0, -'.webp'.length) : null;
}

/** Portrait URL per defender id, resolved at build time. */
const PORTRAIT_URLS: ReadonlyMap<string, string> = new Map(
  Object.entries(PORTRAIT_MODULES).flatMap(([path, url]) => {
    const defenderId = portraitIdFromPath(path);
    return defenderId === null ? [] : [[defenderId, url] as const];
  }),
);

/** The bundled portrait URL of a defender, or null when the portrait is not built yet. */
export function portraitUrl(defenderId: string): string | null {
  return PORTRAIT_URLS.get(defenderId) ?? null;
}
