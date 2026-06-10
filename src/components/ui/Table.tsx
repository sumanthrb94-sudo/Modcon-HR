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
}

export function Table<T>({ columns, data, keyExtractor, onRowClick, emptyMessage = 'No records found' }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 font-semibold text-ink-500 text-xs uppercase tracking-wide whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
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
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-ink-50')}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-ink-700 whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
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
