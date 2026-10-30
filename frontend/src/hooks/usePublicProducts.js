// ============================================================================
// CATÁLOGO PÚBLICO CON STOCK EN TIEMPO REAL
// ----------------------------------------------------------------------------
// El formulario de compra y la solicitud de efectivo necesitan la misma lógica:
//   1. cargar `/public/products`,
//   2. descartar respuestas HTTP que llegaron después de un evento WebSocket,
//   3. aplicar `stock:update` sin recargar la página.
//
// Tenerlo en un hook evita duplicar la carrera entre HTTP y WebSocket en dos
// pantallas. La versión del catálogo (`catalogVersion`) es la que ordena ambos
// canales: una respuesta más vieja nunca pisa un evento más nuevo.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { mergeStockUpdate } from '../utils/stockEvents';
import { useStockUpdates } from './useStockUpdates';

export function usePublicProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const stockVersionRef = useRef(-1);

  useEffect(() => {
    let active = true;
    const requestVersion = stockVersionRef.current;

    api
      .get('/public/products')
      .then((response) => {
        if (!active) return;
        const incoming = Number(response.data.catalogVersion ?? 0);
        if (incoming < stockVersionRef.current) return;
        stockVersionRef.current = incoming;
        setProducts(response.data.products || []);
      })
      .catch(() => {
        if (!active) return;
        // Si el WebSocket ya trajo datos, no borramos la lista por un error HTTP.
        if (stockVersionRef.current !== requestVersion) return;
        setError(
          'No pudimos cargar la disponibilidad de productos en este momento.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const status = useStockUpdates((message) => {
    const incoming = Number(message?.catalogVersion ?? 0);
    if (incoming < stockVersionRef.current) return;
    stockVersionRef.current = incoming;

    setProducts((previous) => mergeStockUpdate(previous, message));
    setError('');
    setLoading(false);
  });

  return { products, loading, error, status };
}
