// Indicador visual del canal de stock. Es puramente informativo: si está
// "Sin conexión", el cliente sigue reintentando en segundo plano.
const STATES = {
  online: {
    label: 'En vivo',
    className: 'bg-green-50 text-green-700',
    dot: 'bg-green-500',
    title: 'El stock se actualiza automáticamente',
  },
  connecting: {
    label: 'Conectando',
    className: 'bg-gray-100 text-gray-600',
    dot: 'bg-gray-400 animate-pulse',
    title: 'Conectando al canal de stock en tiempo real',
  },
  reconnecting: {
    label: 'Reconectando',
    className: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500 animate-pulse',
    title: 'Se perdió la conexión; reintentando',
  },
  offline: {
    label: 'Sin conexión',
    className: 'bg-gray-100 text-gray-500',
    dot: 'bg-gray-400',
    title: 'Sin canal en tiempo real; los datos se actualizan al recargar',
  },
};

export function LiveStockBadge({ status }) {
  const state = STATES[status] || STATES.offline;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${state.className}`}
      title={state.title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
      {state.label}
    </span>
  );
}
