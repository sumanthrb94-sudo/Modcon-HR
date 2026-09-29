import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  stickyFirstColumn?: boolean;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found',
  stickyFirstColumn = false,
  className,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink-900/40 bg-ink-100 text-left">
            {columns.map((col, idx) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 font-semibold text-ink-600 text-[11px] uppercase tracking-[0.08em] whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  stickyFirstColumn && idx === 0 && 'sticky left-0 z-20 bg-ink-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-ink-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn('transition-colors group', onRowClick && 'cursor-pointer hover:bg-ink-900/[0.04]')}
              >
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-ink-700 whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      stickyFirstColumn && idx === 0 && 'sticky left-0 z-10 bg-white group-hover:bg-ink-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]',
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type { Column };
