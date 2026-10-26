/**
 * Portrait lookup for the card visuals (spec 9.8, issue #66/#76, issue #114).
 *
 * The 2.5D pipeline renders 128 x 128 pixel-art head-and-shoulders portraits to
 * `public/sprites/portraits/<id>.png`. They are drawn with nearest-neighbour
 * scaling so the cards match the pixel-art units in the world. The older smooth
 * WebP renders in `public/portraits/<id>.webp` stay as a fallback for any id whose
 * pixel portrait has not been generated yet. Vite resolves both sets at build
 * time, so a missing portrait never causes a 404: the card falls back to its
 * faction gradient instead.
 */
const PIXEL_MODULES: Readonly<Record<string, string>> = import.meta.glob<string>(
  '/public/sprites/portraits/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const SMOOTH_MODULES: Readonly<Record<string, string>> = import.meta.glob<string>(
  '/public/portraits/*.webp',
  { eager: true, query: '?url', import: 'default' },
);

/** One resolved portrait source; `pixelated` is true for the pixel-art PNG set. */
export interface PortraitSource {
  readonly url: string;
  readonly pixelated: boolean;
}

/** Extracts the character id from a glob path like `/public/sprites/portraits/x.png`. */
function idFromPath(path: string): string | null {
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : null;
}

/** Builds the id -> URL lookup of one portrait set. */
function buildIndex(modules: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(modules).flatMap(([path, url]) => {
      const id = idFromPath(path);
      return id === null ? [] : [[id, url] as const];
    }),
  );
}

const PIXEL_URLS = buildIndex(PIXEL_MODULES);
const SMOOTH_URLS = buildIndex(SMOOTH_MODULES);

/** The pixel portrait of a character when it exists, else the smooth fallback. */
export function portraitSource(characterId: string): PortraitSource | null {
  const pixelUrl = PIXEL_URLS.get(characterId);
  if (pixelUrl !== undefined) {
    return { url: pixelUrl, pixelated: true };
  }
  const smoothUrl = SMOOTH_URLS.get(characterId);
  return smoothUrl === undefined ? null : { url: smoothUrl, pixelated: false };
}

/** URL of the pixel portrait, or null when only the smooth/placeholder art exists. */
export function pixelPortraitUrl(characterId: string): string | null {
  return PIXEL_URLS.get(characterId) ?? null;
}

/** The best portrait URL of a character, or null when no portrait is built yet. */
export function portraitUrl(characterId: string): string | null {
  return portraitSource(characterId)?.url ?? null;
}
