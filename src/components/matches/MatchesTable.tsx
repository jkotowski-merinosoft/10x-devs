import { useCallback, useEffect, useMemo, useState } from "react";
import type { FilterFn } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { DataTable } from "@/components/data-table/DataTable";
import { useUrlTableState, type SortDirection } from "@/components/hooks/useUrlTableState";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH, matchesSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { LeagueStakes, Match, Tip } from "@/types";
import { AddMatchDialog } from "./AddMatchDialog";
import { TipDialog } from "./TipDialog";
import { createMatchColumns } from "./columns";

interface Props {
  matches: Match[];
  /** A failed match list read: the alert replaces the table, the organizer can still add a match. */
  loadError: string | null;
  tips: Tip[];
  tipsError: string | null;
  /** `null` after a failed read: the tip hint falls back to the generic text. */
  stakes: LeagueStakes | null;
  isOrganizer: boolean;
  /** Server time (ms) for the open/closed status, so server and client render the same markup. */
  now: number;
  initialQuery: string;
  initialSort: SortDirection;
}

const HIGHLIGHT_MS = 2000;

const searchFilter: FilterFn<Match> = (row, _columnId, query: string) =>
  matchesSearch(`${row.original.side_a} ${row.original.side_b}`, query);

export default function MatchesTable({
  matches,
  loadError,
  tips,
  tipsError,
  stakes,
  isOrganizer,
  now,
  initialQuery,
  initialSort,
}: Props) {
  const [matchList, setMatchList] = useState(matches);
  const [tipByMatch, setTipByMatch] = useState(() => new Map(tips.map((tip) => [tip.match_id, tip])));
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [tipDialogOpen, setTipDialogOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  // The dialog has no DialogTrigger, so Radix cannot return focus to the tip button by itself.
  const [tipTrigger, setTipTrigger] = useState<HTMLElement | null>(null);
  // Server time first, so hydration matches; refreshed on tip clicks so a long-open tab sees kick-offs.
  const [clock, setClock] = useState(now);
  const { query, setQuery, sorting, setSorting } = useUrlTableState(initialQuery, initialSort);

  const handleTipClick = useCallback((matchId: number, trigger: HTMLElement) => {
    setClock(Date.now());
    setTipTrigger(trigger);
    setSelectedMatchId(matchId);
    setTipDialogOpen(true);
  }, []);

  const columns = useMemo(
    () => createMatchColumns({ tipByMatch, showTips: !tipsError, now: clock, onTipClick: handleTipClick }),
    [tipByMatch, tipsError, clock, handleTipClick],
  );

  // A new match: bring its row into view, then drop the highlight.
  useEffect(() => {
    if (highlightId === null) return;
    document.querySelector(`[data-match-id="${highlightId}"]`)?.scrollIntoView({ block: "nearest" });
    const timer = window.setTimeout(() => {
      setHighlightId(null);
    }, HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightId]);

  const handleCreated = (match: Match) => {
    // The local list is incomplete after a failed read; reload to show the full one.
    if (loadError) {
      window.location.reload();
      return;
    }
    setMatchList((prev) => [...prev, match]);
    // The new match must be visible even if the current phrase does not match it.
    setQuery("");
    setHighlightId(match.id);
  };

  const handleSaved = (tip: Tip) => {
    setTipByMatch((prev) => new Map(prev).set(tip.match_id, tip));
  };

  const selectedMatch = matchList.find((match) => match.id === selectedMatchId) ?? null;
  const phrase = query.trim();

  return (
    <div className="space-y-4">
      {tipsError && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
          {tipsError}
        </p>
      )}

      {isOrganizer && (
        <div className="flex justify-end">
          <AddMatchDialog onCreated={handleCreated} />
        </div>
      )}

      {loadError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-blue-100/50"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Szukaj meczu"
              aria-label="Szukaj meczu"
              maxLength={MAX_SEARCH_LENGTH}
              className="pl-9"
            />
          </div>

          <DataTable
            columns={columns}
            data={matchList}
            getRowId={(match) => String(match.id)}
            sorting={sorting}
            onSortingChange={setSorting}
            globalFilter={query}
            onGlobalFilterChange={setQuery}
            globalFilterFn={searchFilter}
            rowProps={(row) => ({
              "data-match-id": String(row.original.id),
              className: cn("transition-colors duration-700", row.original.id === highlightId && "bg-purple-500/25"),
            })}
            emptyMessage={matchList.length === 0 || !phrase ? "Brak meczów" : `Brak meczów pasujących do „${phrase}”`}
          />

          {!tipsError && (
            <TipDialog
              match={selectedMatch}
              tip={selectedMatch ? tipByMatch.get(selectedMatch.id) : undefined}
              stakes={stakes}
              isOpen={tipDialogOpen}
              onOpenChange={setTipDialogOpen}
              onSaved={handleSaved}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                tipTrigger?.focus();
              }}
              now={clock}
            />
          )}
        </>
      )}
    </div>
  );
}
