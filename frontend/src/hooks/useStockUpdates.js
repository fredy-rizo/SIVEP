// ============================================================================
// HOOK DE STOCK EN TIEMPO REAL
// ----------------------------------------------------------------------------
// Envuelve el cliente compartido de `utils/realtime.js` para usarlo desde React.
// Devuelve el estado de la conexión ('connecting' | 'reconnecting' | 'online' |
// 'offline') y garantiza que el listener siempre apunte a la última versión del
// callback, sin reconectar en cada render.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import {
  getRealtimeStatus,
  subscribeToStatus,
  subscribeToStock,
} from '../utils/realtime';

export function useStockUpdates(onUpdate, { token = null } = {}) {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  const [status, setStatus] = useState(() => getRealtimeStatus(token));

  useEffect(() => {
    setStatus(getRealtimeStatus(token));

    const unsubscribeStock = subscribeToStock(
      (message) => handlerRef.current?.(message),
      { token },
    );
    const unsubscribeStatus = subscribeToStatus(setStatus, { token });

    return () => {
      unsubscribeStock();
      unsubscribeStatus();
    };
  }, [token]);

  return status;
}
