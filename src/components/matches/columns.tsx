import type { ColumnDef, SortingFn } from "@tanstack/react-table";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { Button } from "@/components/ui/button";
import { formatWarsaw } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Match, Tip } from "@/types";

interface MatchColumnsOptions {
  tipByMatch: Map<number, Tip>;
  /** Hide the "Twój typ" column, e.g. when the tips could not be loaded. */
  showTips: boolean;
  /** Server time (ms) the open/closed status is computed against; never `Date.now()` in render. */
  now: number;
  /** Opens the tip dialog for the match; `trigger` gets focus back when the dialog closes. */
  onTipClick: (matchId: number, trigger: HTMLElement) => void;
  /** Shows the result entry button on started matches. */
  isOrganizer: boolean;
  /** Opens the result dialog for the match; `trigger` gets focus back when the dialog closes. */
  onResultClick: (matchId: number, trigger: HTMLElement) => void;
}

/** Same order as `listMatches`: kick-off time, then id. TanStack reverses the whole result for `desc`. */
const byStartsAt: SortingFn<Match> = (a, b) => {
  const diff = new Date(a.original.starts_at).getTime() - new Date(b.original.starts_at).getTime();
  return diff !== 0 ? Math.sign(diff) : a.original.id - b.original.id;
};

function isOpen(match: Match, now: number): boolean {
  return now < new Date(match.starts_at).getTime();
}

function resultText(match: Match): string {
  return match.score_a !== null && match.score_b !== null ? `${match.score_a}:${match.score_b}` : "";
}

function statusLabel(open: boolean): string {
  return open ? "otwarte" : "zamknięte";
}

export function createMatchColumns({
  tipByMatch,
  showTips,
  now,
  onTipClick,
  isOrganizer,
  onResultClick,
}: MatchColumnsOptions): ColumnDef<Match, string>[] {
  const columns: ColumnDef<Match, string>[] = [
    {
      id: "match",
      // Searchable text; the global filter reads `row.original`, but TanStack needs a string accessor.
      accessorFn: (match) => `${match.side_a} ${match.side_b}`,
      header: "Mecz",
      enableSorting: false,
      cell: ({ row }) => {
        const match = row.original;
        return (
          <div className="flex flex-col gap-0.5 whitespace-normal">
            <a
              href={`/matches/${match.id}`}
              className="font-semibold text-white transition-colors hover:text-purple-200 hover:underline"
            >
              {match.side_a} – {match.side_b}
            </a>
            <span className="text-xs text-blue-100/60 sm:hidden">{formatWarsaw(match.starts_at)}</span>
          </div>
        );
      },
    },
    {
      id: "starts_at",
      accessorKey: "starts_at",
      header: ({ column }) => <SortableHeader column={column}>Data</SortableHeader>,
      sortingFn: byStartsAt,
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => <span className="text-blue-100/70">{formatWarsaw(row.original.starts_at)}</span>,
    },
  ];

  if (showTips) {
    columns.push({
      id: "tip",
      header: "Twój typ",
      enableSorting: false,
      cell: ({ row }) => {
        const match = row.original;
        const tip = tipByMatch.get(match.id);
        const value = tip ? `${tip.score_a}:${tip.score_b}` : "";
        const open = isOpen(match, now);
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className={cn("size-2 shrink-0 rounded-full sm:hidden", open ? "bg-green-400" : "bg-white/30")}
              title={statusLabel(open)}
            >
              <span className="sr-only">{statusLabel(open)}</span>
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-blue-100/80"
              aria-haspopup="dialog"
              data-tip={value}
              onClick={(e) => {
                onTipClick(match.id, e.currentTarget);
              }}
            >
              {value || "brak typu"}
            </Button>
          </span>
        );
      },
    });
  }

  columns.push({
    id: "result",
    header: "Wynik",
    enableSorting: false,
    cell: ({ row }) => {
      const match = row.original;
      const value = resultText(match);
      // Before kick-off nobody can enter a result (RLS), so the organizer sees plain text too.
      if (isOrganizer && !isOpen(match, now)) {
        return (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-blue-100/80"
            aria-haspopup="dialog"
            data-result={value}
            onClick={(e) => {
              onResultClick(match.id, e.currentTarget);
            }}
          >
            {value || "wpisz wynik"}
          </Button>
        );
      }
      return (
        <span data-result={value} className={cn(value ? "font-mono text-white" : "text-blue-100/50")}>
          {value || "—"}
        </span>
      );
    },
  });

  if (showTips) {
    columns.push({
      id: "points",
      header: "Pkt",
      enableSorting: false,
      cell: ({ row }) => {
        const points = tipByMatch.get(row.original.id)?.points ?? null;
        return (
          <span
            data-points={points === null ? "" : String(points)}
            className={cn(points === null ? "text-blue-100/50" : "font-semibold text-white")}
          >
            {points ?? "—"}
          </span>
        );
      },
    });
  }

  columns.push({
    id: "status",
    header: "Status",
    enableSorting: false,
    meta: { className: "hidden sm:table-cell" },
    cell: ({ row }) => {
      const open = isOpen(row.original, now);
      return (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            open ? "border-green-400/40 text-green-300" : "border-white/20 text-blue-100/50",
          )}
        >
          {statusLabel(open)}
        </span>
      );
    },
  });

  return columns;
}
