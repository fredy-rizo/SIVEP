import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Settings2 } from 'lucide-react';
import api from '../utils/api';
import { Modal } from './Modal';

const DECISION_KEY = 'sivep-cookies-ok';

// La decisión se guarda en localStorage para que el aviso no vuelva a aparecer
// en cada recarga, aunque la cookie del backend no esté disponible.
function hasStoredDecision() {
  try {
    return localStorage.getItem(DECISION_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function storeDecision() {
  try {
    localStorage.setItem(DECISION_KEY, '1');
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

// Categorías de cookies. Las "necesarias" (sesión, tema) siempre están activas;
// las demás son opcionales y el usuario decide cuáles acepta.
const OPTIONAL_CATEGORIES = [
  {
    key: 'preferences',
    title: 'Preferencias',
    description: 'Recuerdan ajustes de uso como el tema claro/oscuro o filtros.',
  },
  {
    key: 'analytics',
    title: 'Analítica',
    description: 'Ayudan a entender de forma agregada cómo se usa el sistema.',
  },
  {
    key: 'marketing',
    title: 'Publicidad',
    description: 'Se usarían para mostrar contenido promocional relevante.',
  },
];

const ALL_OFF = { preferences: false, analytics: false, marketing: false };

// Aviso de cookies: aparece en la primera visita (o si no hay decisión
// guardada) con opciones Aceptar / Rechazar / Personalizar.
// La decisión se guarda en el backend (cookie técnica cookie_consent,
// ver GET/POST /cookies/consent) y en localStorage como respaldo.
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState(ALL_OFF);

  useEffect(() => {
    let active = true;

    // Si ya decidió en este navegador, el aviso no se vuelve a mostrar.
    if (hasStoredDecision()) {
      setVisible(false);
      return undefined;
    }

    const check = async () => {
      try {
        const { data } = await api.get('/cookies/consent');
        if (!active) return;
        if (data.consent === 'accepted' || data.consent === 'rejected' || data.consent === 'custom') {
          storeDecision();
          if (data.categories) {
            setPrefs({
              preferences: !!data.categories.preferences,
              analytics: !!data.categories.analytics,
              marketing: !!data.categories.marketing,
            });
          }
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (e) {
        // Sin backend: se muestra solo si no hay una decisión local.
        if (active) setVisible(true);
      }
    };
    check();

    return () => {
      active = false;
    };
  }, []);

  const persist = async (payload) => {
    try {
      const { data } = await api.post('/cookies/consent', payload);
      if (data.categories) {
        setPrefs({
          preferences: !!data.categories.preferences,
          analytics: !!data.categories.analytics,
          marketing: !!data.categories.marketing,
        });
      }
      return data.consent;
    } catch (e) {
      console.error('No se pudo guardar la preferencia en el servidor:', e);
      return null;
    }
  };

  // Decisión rápida (Aceptar / Rechazar).
  const choose = async (accepted) => {
    storeDecision();
    setSaving(true);
    setPrefsOpen(false);
    setVisible(false);
    await persist({ accepted });
    setSaving(false);
  };

  // Decisión personalizada por categoría.
  const saveCustom = async () => {
    storeDecision();
    setSaving(true);
    setPrefsOpen(false);
    setVisible(false);
    await persist({ categories: { ...prefs } });
    setSaving(false);
  };

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  if (!visible) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Aviso sobre cookies"
        className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4"
      >
        <div className="max-w-3xl mx-auto card p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-lg">
          <div className="flex items-start gap-3 flex-1">
            <Cookie className="w-5 h-5 mt-0.5 flex-shrink-0 text-unal-primary" />
            <p className="text-sm text-unal-secondary">
              Usamos almacenamiento técnico necesario (sesión y tema) y, con tu permiso,
              cookies opcionales. Puedes aceptarlas, rechazarlas o elegir por categoría.{' '}
              <Link to="/cookies" className="text-unal-primary hover:underline font-medium">
                Ver política
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={() => choose(false)}
              disabled={saving}
              className="btn-secondary text-sm px-4 py-2 disabled:opacity-50"
            >
              Rechazar
            </button>
            <button
              onClick={() => setPrefsOpen(true)}
              disabled={saving}
              className="btn-outline text-sm px-4 py-2 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Settings2 className="w-4 h-4" />
              Personalizar
            </button>
            <button
              onClick={() => choose(true)}
              disabled={saving}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        title="Preferencias de cookies"
        size="md"
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-unal-secondary">Estrictamente necesarias</p>
                <p className="text-unal-secondary-light mt-1">
                  Sesión de administración y preferencia de tema. Sin ellas el sitio no
                  funciona.
                </p>
              </div>
              <span className="badge badge-gray flex-shrink-0">Siempre activas</span>
            </div>
          </div>

          {OPTIONAL_CATEGORIES.map((cat) => (
            <div key={cat.key} className="rounded-lg border border-gray-200 p-3">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <p className="font-semibold text-unal-secondary">{cat.title}</p>
                  <p className="text-unal-secondary-light mt-1">{cat.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={!!prefs[cat.key]}
                  onChange={() => toggle(cat.key)}
                  className="mt-1 w-5 h-5 flex-shrink-0 accent-unal-primary"
                  aria-label={`Activar cookies de ${cat.title}`}
                />
              </label>
            </div>
          ))}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button
              onClick={() => choose(false)}
              disabled={saving}
              className="btn-secondary disabled:opacity-50"
            >
              Rechazar todas
            </button>
            <button
              onClick={saveCustom}
              disabled={saving}
              className="btn-outline inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Settings2 className="w-4 h-4" />
              Guardar preferencias
            </button>
            <button
              onClick={() => choose(true)}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              Aceptar todas
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
