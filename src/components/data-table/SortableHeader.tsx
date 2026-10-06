import type { ReactNode } from "react";
import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  children: ReactNode;
  className?: string;
}

/** Header button that toggles the column's sort; `DataTable` puts `aria-sort` on the `<th>`. */
export function SortableHeader<TData, TValue>({ column, children, className }: SortableHeaderProps<TData, TValue>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-3 h-8", className)}
      onClick={() => {
        column.toggleSorting(sorted === "asc");
      }}
    >
      {children}
      <Icon aria-hidden="true" className={cn("size-4", !sorted && "opacity-50")} />
    </Button>
  );
}
