import { useState, useEffect } from 'react';
import { LegalLayout, LegalSection, LegalList } from './LegalLayout';
import api from '../../utils/api';
import toast from '../../utils/toast';

const OPTIONAL_CATEGORIES = [
  { key: 'preferences', title: 'Preferencias', description: 'Recuerdan ajustes de uso como el tema claro/oscuro o filtros.' },
  { key: 'analytics', title: 'Analítica', description: 'Ayudan a entender de forma agregada cómo se usa el sistema.' },
  { key: 'marketing', title: 'Publicidad', description: 'Se usarían para mostrar contenido promocional relevante.' },
];

function applyCategories(state, setPrefs) {
  if (state) {
    setPrefs({
      preferences: !!state.preferences,
      analytics: !!state.analytics,
      marketing: !!state.marketing,
    });
  }
}

export function CookiesPage() {
  const [consent, setConsent] = useState('unknown');
  const [saving, setSaving] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState({ preferences: false, analytics: false, marketing: false });

  useEffect(() => {
    api.get('/cookies/consent')
      .then(({ data }) => {
        setConsent(data.consent || 'unknown');
        applyCategories(data.categories, setPrefs);
      })
      .catch(() => setConsent('unknown'));
  }, []);

  const persist = async (payload) => {
    setSaving(true);
    try {
      const { data } = await api.post('/cookies/consent', payload);
      setConsent(data.consent);
      applyCategories(data.categories, setPrefs);
      try { localStorage.setItem('sivep-cookies-ok', '1'); } catch (e) {}
    } catch {
      toast.error('Error', 'No se pudo guardar la preferencia');
    } finally {
      setSaving(false);
    }
  };

  const choose = (accepted) => persist({ accepted });
  const saveCustom = () => persist({ categories: { ...prefs } });
  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const consentLabel =
    consent === 'accepted' ? 'Aceptadas'
      : consent === 'rejected' ? 'Rechazadas'
        : consent === 'custom' ? 'Personalizadas'
          : 'Sin definir';

  return (
    <LegalLayout title="Política de Cookies y Sesión" updated="septiembre de 2026">
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-unal-secondary flex-1">
          Tu elección actual: <strong>{consentLabel}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => choose(false)} disabled={saving} className="btn-secondary text-sm px-4 py-2 disabled:opacity-50">
            Rechazar
          </button>
          <button onClick={() => setShowPrefs((v) => !v)} disabled={saving} className="btn-outline text-sm px-4 py-2 disabled:opacity-50">
            Personalizar
          </button>
          <button onClick={() => choose(true)} disabled={saving} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
            Aceptar
          </button>
        </div>
      </div>

      {showPrefs && (
        <div className="card p-4 space-y-3">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-unal-secondary text-sm">Estrictamente necesarias</p>
              <p className="text-unal-secondary-light text-sm mt-1">Sesión de administración y preferencia de tema. Sin ellas el sitio no funciona.</p>
            </div>
            <span className="badge badge-gray flex-shrink-0">Siempre activas</span>
          </div>
          {OPTIONAL_CATEGORIES.map((cat) => (
            <div key={cat.key} className="rounded-lg border border-gray-200 p-3">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <p className="font-semibold text-unal-secondary text-sm">{cat.title}</p>
                  <p className="text-unal-secondary-light text-sm mt-1">{cat.description}</p>
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
          <div className="flex justify-end">
            <button onClick={saveCustom} disabled={saving} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
              Guardar preferencias
            </button>
          </div>
        </div>
      )}

      <LegalSection title="1. ¿Usamos cookies?">
        <p>
          Este sitio <strong>no instala cookies de seguimiento, publicidad ni analítica
          de terceros</strong>. Solo usa una cookie técnica que recuerda tu decisión
          —aceptar, rechazar o personalizar por categoría— y almacenamiento mínimo
          en tu navegador, necesario para que el sitio funcione.
        </p>
      </LegalSection>

      <LegalSection title="2. Almacenamiento técnico (imprescindible)">
        <LegalList items={[
          'Sesión de administración: un token de acceso (JWT) con vigencia de 24 horas. Se borra al cerrar sesión.',
          'Preferencia de tema: modo claro u oscuro que usted elija.',
          'Aviso informativo: recuerda si ya vio el aviso sobre este almacenamiento.'
        ]} />
        <p>
          Estos datos nunca salen de su navegador salvo el token de sesión, que se envía
          únicamente a nuestros propios servidores y solo por conexión cifrada (HTTPS) en
          producción.
        </p>
      </LegalSection>

      <LegalSection title="3. Base legal en Colombia">
        <p>
          La normativa colombiana (Ley 1581 de 2012) exige autorización previa para tratar
          datos personales, la cual se recoge con la casilla de aceptación del formulario.
          Para tecnologías estrictamente necesarias para el funcionamiento —como las
          descritas arriba— no se requiere un consentimiento adicional de cookies, pero
          informamos de ellas aquí por transparencia, siguiendo los lineamientos de la
          Superintendencia de Industria y Comercio.
        </p>
      </LegalSection>

      <LegalSection title="4. Servicios de terceros que reciben datos técnicos">
        <LegalList items={[
          'Cloudinary: aloja las fotos de productos y comprobantes por encargo nuestro (solo almacenamiento).',
          'Unsplash (CDN de imágenes): las fotos ilustrativas de la página principal se cargan desde sus servidores, que reciben su dirección IP como en cualquier carga web.',
          'No usamos Google Fonts, analítica ni píxeles publicitarios.'
        ]} />
      </LegalSection>

      <LegalSection title="5. Control en sus manos">
        <p>
          Puede borrar en cualquier momento el almacenamiento del sitio desde los ajustes
          de su navegador (borrar datos del sitio). Tenga en cuenta que al hacerlo se
          cerrará su sesión de administración si la tenía abierta.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}