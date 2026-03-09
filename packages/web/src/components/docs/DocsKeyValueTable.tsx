interface DocsKeyValueTableProps {
  title?: string;
  columns: string[];
  rows: string[][];
}

export function DocsKeyValueTable({ title, columns, rows }: DocsKeyValueTableProps) {
  return (
    <section className="space-y-4">
      {title ? <h3 className="text-xl font-semibold text-text-primary">{title}</h3> : null}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-hover">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${columns[cellIndex]}-${cellIndex}`}
                      className={`px-4 py-4 align-top leading-6 ${
                        cellIndex === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
