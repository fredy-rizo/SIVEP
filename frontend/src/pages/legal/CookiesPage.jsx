import { LegalLayout, LegalSection, LegalList } from './LegalLayout';

export function CookiesPage() {
  return (
    <LegalLayout title="Política de Cookies y Sesión" updated="septiembre de 2026">
      <LegalSection title="1. ¿Usamos cookies?">
        <p>
          <strong>No.</strong> Este sitio no instala cookies de seguimiento, publicidad ni
          analítica de terceros. Por eso no le pedimos un consentimiento de cookies: no hay
          nada que consentir. Solo guardamos información técnica mínima en su navegador
          (localStorage), necesaria para que el sitio funcione.
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