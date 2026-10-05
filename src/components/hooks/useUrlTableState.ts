import { useEffect, useState } from "react";
import { functionalUpdate, type OnChangeFn, type SortingState } from "@tanstack/react-table";

export type SortDirection = "asc" | "desc";

const SORT_COLUMN = "starts_at";

/**
 * Search phrase (`q`) and sort direction (`sort`) of a table kept in the query string,
 * so a reload or a shared link restores the view. Initial values come from the server,
 * which already rendered the filtered and sorted rows. Defaults (empty phrase, `asc`) are
 * removed from the URL; other query parameters are kept.
 */
export function useUrlTableState(initialQuery: string, initialSort: SortDirection) {
  const [query, setQueryState] = useState(initialQuery);
  const [direction, setDirection] = useState<SortDirection>(initialSort);

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = query.trim();
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (direction === "desc") url.searchParams.set("sort", "desc");
    else url.searchParams.delete("sort");
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [query, direction]);

  const sorting: SortingState = [{ id: SORT_COLUMN, desc: direction === "desc" }];

  const setQuery: OnChangeFn<string> = (updater) => {
    setQueryState((prev) => functionalUpdate(updater, prev));
  };

  const setSorting: OnChangeFn<SortingState> = (updater) => {
    const next = functionalUpdate(updater, sorting).find((s) => s.id === SORT_COLUMN);
    // A removed sort falls back to the default direction; the column is always sorted.
    setDirection(next?.desc ? "desc" : "asc");
  };

  return { query, setQuery, sorting, setSorting };
}
