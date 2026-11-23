import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

// Construye la lista de botones de página al estilo de Google: primera,
// última, la actual con sus vecinas, y puntos suspensivos donde hay saltos.
function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);

  if (currentPage <= 3) {
    [2, 3, 4].forEach((page) => pages.add(page));
  }
  if (currentPage >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) =>
      pages.add(page),
    );
  }

  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push(`gap-${page}`);
    items.push(page);
    previous = page;
  }
  return items;
}

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
  className = '',
  // Paginación del servidor: cuando llega `onPageChange`, la tabla NO corta
  // los datos (ya vienen paginados) y los controles los maneja el padre.
  currentPage: controlledPage,
  totalPages: controlledTotalPages,
  totalItems,
  onPageChange,
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [internalPage, setInternalPage] = useState(1);

  const serverPaginated = typeof onPageChange === 'function';
  const currentPage = serverPaginated ? controlledPage || 1 : internalPage;

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
    if (!pagination || serverPaginated) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, serverPaginated, currentPage, pageSize]);

  const totalRows = serverPaginated
    ? Number(totalItems) || 0
    : sortedData.length;
  const totalPages = serverPaginated
    ? Math.max(1, Number(controlledTotalPages) || 0)
    : Math.ceil(totalRows / pageSize);

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  // Si el servidor devuelve menos páginas (por un filtro), se vuelve a la
  // última página válida en lugar de quedar en una página vacía.
  useEffect(() => {
    if (serverPaginated && totalRows > 0 && currentPage > totalPages) {
      onPageChange(totalPages);
    }
  }, [serverPaginated, totalRows, currentPage, totalPages, onPageChange]);

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handlePageChange = (page) => {
    if (serverPaginated) {
      if (page < 1 || page > totalPages || page === currentPage) return;
      onPageChange(page);
      return;
    }
    setInternalPage(page);
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
            Mostrando {Math.min((currentPage - 1) * pageSize + 1, totalRows)} a{' '}
            {Math.min(currentPage * pageSize, totalRows)} de {totalRows}
          </p>

          <nav
            aria-label="Paginación"
            className="flex flex-wrap items-center justify-center gap-1"
          >
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Página anterior"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-unal-secondary transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            </button>

            {pageItems.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  onClick={() => handlePageChange(item)}
                  aria-label={`Ir a la página ${item}`}
                  aria-current={item === currentPage ? 'page' : undefined}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors ${
                    item === currentPage
                      ? 'border-unal-primary bg-unal-primary text-white'
                      : 'border-gray-300 text-unal-secondary hover:bg-gray-100'
                  }`}
                >
                  {item}
                </button>
              ) : (
                <span
                  key={item}
                  className="flex h-9 w-6 items-center justify-center text-sm text-unal-secondary-light"
                  aria-hidden="true"
                >
                  …
                </span>
              ),
            )}

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Página siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-unal-secondary transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}