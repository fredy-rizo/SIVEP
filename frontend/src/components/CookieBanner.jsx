import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X, Settings2 } from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import { Modal } from './Modal';

const LEGACY_KEY = 'sivep-cookies-ok';

// Aviso de cookies: aparece en la primera visita (o si no hay decisión
// guardada) con opciones Aceptar / Rechazar / Personalizar.
// La decisión se guarda en el backend (cookie técnica cookie_consent,
// ver GET/POST /api/cookies/consent) y en localStorage como respaldo.
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await api.get('/api/cookies/consent');
        if (data.consent === 'accepted' || data.consent === 'rejected') {
          try { localStorage.setItem(LEGACY_KEY, '1'); } catch (e) {}
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (e) {
        // Sin backend: se respeta la marca local si existe.
        try {
          if (!localStorage.getItem(LEGACY_KEY)) setVisible(true);
        } catch (err) {
          setVisible(true);
        }
      }
    };
    check();
  }, []);

  const choose = async (accepted) => {
    setSaving(true);
    try {
      await api.post('/api/cookies/consent', { accepted });
    } catch (e) {
      console.error('No se pudo guardar la preferencia en el servidor:', e);
    }
    try { localStorage.setItem(LEGACY_KEY, '1'); } catch (err) {}
    setSaving(false);
    setPrefsOpen(false);
    setVisible(false);
    toast.success(
      'Preferencia guardada',
      accepted ? 'Aceptaste el almacenamiento técnico.' : 'Rechazaste las cookies opcionales.'
    );
  };

  if (!visible) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Aviso sobre almacenamiento técnico"
        className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4"
      >
        <div className="max-w-3xl mx-auto card p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-lg">
          <div className="flex items-start gap-3 flex-1">
            <Cookie className="w-5 h-5 mt-0.5 flex-shrink-0 text-unal-primary" />
            <p className="text-sm text-unal-secondary">
              Usamos solo almacenamiento técnico necesario (sesión y tema). No usamos
              cookies de seguimiento ni publicidad.{' '}
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
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="font-semibold text-unal-secondary">Estrictamente necesarias (siempre activas)</p>
            <p className="text-unal-secondary-light mt-1">
              Sesión de administración y preferencia de tema. Sin ellas el sitio no funciona.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="font-semibold text-unal-secondary">Opcionales (seguimiento y publicidad)</p>
            <p className="text-unal-secondary-light mt-1">
              Este sitio <strong>no utiliza</strong> cookies opcionales. Rechazar equivale a aceptar,
              pero registramos tu decisión.
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button onClick={() => choose(false)} disabled={saving} className="btn-secondary disabled:opacity-50">
              Rechazar opcionales
            </button>
            <button onClick={() => choose(true)} disabled={saving} className="btn-primary disabled:opacity-50">
              Aceptar todas
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}