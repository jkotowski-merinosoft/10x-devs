/** Longest search phrase accepted by search inputs and the `q` query parameter. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Folds text for search: case-insensitive and without Polish diacritics.
 * "ł" does not decompose in NFD, so it is replaced explicitly before stripping marks.
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** True when `text` contains the phrase `query`; an empty phrase matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  return normalizeForSearch(text).includes(normalizeForSearch(query.trim()));
}
