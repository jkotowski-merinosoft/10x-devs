import { useMemo, useState } from "react";
import type { FilterFn } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { DataTable } from "@/components/data-table/DataTable";
import { useUrlTableState, type SortDirection } from "@/components/hooks/useUrlTableState";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH, matchesSearch } from "@/lib/search";
import type { Match, Tip } from "@/types";
import { createMatchColumns } from "./columns";

interface Props {
  matches: Match[];
  tips: Tip[];
  tipsError: string | null;
  isOrganizer: boolean;
  /** Server time (ms) for the open/closed status, so server and client render the same markup. */
  now: number;
  initialQuery: string;
  initialSort: SortDirection;
}

const searchFilter: FilterFn<Match> = (row, _columnId, query: string) =>
  matchesSearch(`${row.original.side_a} ${row.original.side_b}`, query);

// `isOrganizer` is used by the add/edit modals of the next phase.
export default function MatchesTable({ matches, tips, tipsError, now, initialQuery, initialSort }: Props) {
  const [matchList] = useState(matches);
  const [tipByMatch] = useState(() => new Map(tips.map((tip) => [tip.match_id, tip])));
  const { query, setQuery, sorting, setSorting } = useUrlTableState(initialQuery, initialSort);

  const columns = useMemo(
    () => createMatchColumns({ tipByMatch, showTips: !tipsError, now }),
    [tipByMatch, tipsError, now],
  );

  const phrase = query.trim();

  return (
    <div className="space-y-4">
      {tipsError && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300" role="alert">
          {tipsError}
        </p>
      )}

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
        rowProps={(row) => ({ "data-match-id": String(row.original.id) })}
        emptyMessage={matchList.length === 0 || !phrase ? "Brak meczów" : `Brak meczów pasujących do „${phrase}”`}
      />
    </div>
  );
}
