import { useState, useEffect } from 'react';
import { LegalLayout, LegalSection, LegalList } from './LegalLayout';
import api from '../../utils/api';
import toast from '../../utils/toast';

export function CookiesPage() {
  const [consent, setConsent] = useState('unknown');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/cookies/consent')
      .then(({ data }) => setConsent(data.consent || 'unknown'))
      .catch(() => setConsent('unknown'));
  }, []);

  const choose = async (accepted) => {
    setSaving(true);
    try {
      const { data } = await api.post('/api/cookies/consent', { accepted });
      setConsent(data.consent);
      try { localStorage.setItem('sivep-cookies-ok', '1'); } catch (e) {}
      toast.success('Preferencia guardada');
    } catch (error) {
      toast.error('Error', 'No se pudo guardar la preferencia');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LegalLayout title="Política de Cookies y Sesión" updated="septiembre de 2026">
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-unal-secondary flex-1">
          Tu elección actual:{' '}
          <strong>
            {consent === 'accepted' ? 'Aceptadas' : consent === 'rejected' ? 'Rechazadas' : 'Sin definir'}
          </strong>
        </p>
        <div className="flex gap-2">
          <button onClick={() => choose(false)} disabled={saving} className="btn-secondary text-sm px-4 py-2 disabled:opacity-50">
            Rechazar
          </button>
          <button onClick={() => choose(true)} disabled={saving} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
            Aceptar
          </button>
        </div>
      </div>

      <LegalSection title="1. ¿Usamos cookies?">
        <p>
          Este sitio <strong>no instala cookies de seguimiento, publicidad ni analítica
          de terceros</strong>. Solo usa una cookie técnica que recuerda si aceptaste o
          rechazaste (por eso ves el aviso con ambas opciones) y almacenamiento mínimo
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