import { type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  sticky?: boolean
  width?: string
  cellClassName?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  caption?: string
  loading?: boolean
  emptyState?: ReactNode
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  caption,
  loading,
  emptyState,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="table-wrapper" aria-busy="true">
        <div className="table-skeleton">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton table-skeleton__row" />
          ))}
        </div>
      </div>
    )
  }

  if (!loading && rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className="table-wrapper" role="region" tabIndex={0} aria-label={caption}>
      <table className={`table ${onRowClick ? 'table--interactive' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width, textAlign: col.align ?? 'left' }}
                className={col.sticky ? 'table__th--sticky' : ''}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') onRowClick(row) }
                  : undefined
              }
              role={onRowClick ? 'button' : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{ textAlign: col.align ?? 'left' }}
                  className={col.cellClassName}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
