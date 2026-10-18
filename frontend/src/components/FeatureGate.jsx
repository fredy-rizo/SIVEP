import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { usePlan } from '../context/PlanContext';

// ============================================================================
// FEATURE GATE — SIVEP
// ----------------------------------------------------------------------------
// `FeatureGate` renderiza a sus hijos solo si el plan del usuario incluye la
// feature indicada; en caso contrario muestra `fallback` (o un candado con CTA
// de mejora de plan). `LockedFeature` es ese panel de "bloqueado" reutilizable.
// ============================================================================

export function LockedFeature({
  title = 'Función no incluida en tu plan',
  description = 'Esta función forma parte de un plan superior. Mejora tu plan para desbloquearla.',
  featureLabel,
}) {
  return (
    <div className="card p-8 text-center">
      <div className="w-14 h-14 mx-auto mb-4 bg-unal-primary/10 rounded-full flex items-center justify-center">
        <Lock className="w-7 h-7 text-unal-primary" strokeWidth={2} />
      </div>
      <p className="text-unal-secondary font-semibold text-lg">{title}</p>
      {featureLabel && (
        <p className="text-sm text-unal-primary font-medium mt-1">{featureLabel}</p>
      )}
      <p className="text-sm text-unal-secondary-light mt-2 max-w-md mx-auto">
        {description}
      </p>
      <Link
        to="/mi-plan"
        className="btn-primary inline-flex items-center gap-2 mt-5"
      >
        <Sparkles className="w-4 h-4" /> Mejorar plan
      </Link>
    </div>
  );
}

export function FeatureGate({ feature, children, fallback }) {
  const { hasFeature } = usePlan();
  if (hasFeature(feature)) return children;
  return fallback ?? <LockedFeature />;
}
