import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useMemo } from 'react';

export function DataTable({ 
  columns, 
  data, 
  keyField = 'id',
  onRowClick,
  sortable = true,
  pagination = true,
  pageSize = 10,
  emptyMessage = 'No hay datos disponibles',
  renderActions,
  className = ''
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortable || !sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className={`card ${className}`}>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className={col.className}>
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {sortable && col.sortable !== false && (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="p-0.5 hover:bg-gray-100 rounded text-unal-secondary-light transition-colors"
                        aria-label={`Ordenar por ${col.label}`}
                      >
                        {sortConfig.key === col.key ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUp className="w-4 h-4 text-unal-primary" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-unal-primary" />
                          )
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {renderActions && <th className="w-32">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderActions ? 1 : 0)} className="px-4 py-8 text-center text-unal-secondary-light">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map(row => (
                <tr
                  key={row[keyField]}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {columns.map(col => (
                    <td key={col.key} className={col.className}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                  {renderActions && (
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {renderActions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-unal-secondary-light text-center sm:text-left">
            Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, sortedData.length)} de {sortedData.length}
          </p>
          <div className="flex gap-2 items-center justify-center">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 text-unal-secondary hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            </button>
            <span className="flex items-center px-3 text-sm text-unal-secondary">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 text-unal-secondary hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}