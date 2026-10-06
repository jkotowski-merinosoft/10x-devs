import type { HTMLAttributes, ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFnOption,
  type OnChangeFn,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // TData/TValue must match TanStack's declaration for the merge to work.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for both `<th>` and `<td>` of the column, e.g. `hidden sm:table-cell`. */
    className?: string;
  }
}

interface DataTableProps<TData> {
  // TanStack column helpers produce mixed value types; `any` is the library's own convention here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  data: TData[];
  getRowId: (row: TData) => string;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  globalFilter: string;
  onGlobalFilterChange: OnChangeFn<string>;
  globalFilterFn: FilterFnOption<TData>;
  /** Extra attributes for a `<tr>` (classes, `data-*`). */
  rowProps?: (row: Row<TData>) => HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string | undefined>;
  emptyMessage: ReactNode;
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * Generic table on TanStack + shadcn `Table`. Sorting and the global filter are controlled,
 * so their owner (e.g. a URL state hook) lives outside the component.
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  globalFilterFn,
  rowProps,
  emptyMessage,
}: DataTableProps<TData>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable functions by design.
  const table = useReactTable({
    columns,
    data,
    getRowId,
    state: { sorting, globalFilter },
    onSortingChange,
    onGlobalFilterChange,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.className}
                  aria-sort={header.column.getCanSort() ? (sorted ? ARIA_SORT[sorted] : "none") : undefined}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => {
            const extra = rowProps?.(row);
            return (
              <TableRow key={row.id} {...extra} className={cn(extra?.className)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell
              colSpan={table.getVisibleLeafColumns().length}
              className="text-muted-foreground h-24 text-center"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
