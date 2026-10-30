import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

// ============================================================================
// CONTEXTO DE PLAN — SIVEP
// ----------------------------------------------------------------------------
// Trae desde el backend (/billing/me) el plan, features, límites y uso de la
// organización del usuario, y expone `hasFeature(code)` para mostrar u ocultar
// funciones premium en toda la app sin repetir consultas.
//
// El backend sigue siendo la autoridad (protege las rutas con 402); este
// contexto solo mejora la experiencia (no mostrar lo que no está incluido).
// ============================================================================

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setPlan(null);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get('/billing/me');
      setPlan(response.data);
    } catch {
      // Si el endpoint aún no existe (backend sin reiniciar) no se rompe la app.
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasFeature = useCallback(
    (code) => {
      if (!plan) return false;
      if (plan.isSuperAdmin) return true;
      return (plan.features || []).includes(code);
    },
    [plan]
  );

  const value = {
    plan,
    loading,
    refresh,
    hasFeature,
    planCode: plan?.plan?.code || null,
    planName: plan?.plan?.name || null,
    isActive: plan?.isActive ?? true,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return context;
}
