import { Link } from 'react-router-dom';
import { LegalLayout, LegalSection, LegalList } from './LegalLayout';

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidad y Tratamiento de Datos" updated="septiembre de 2026">
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          Responsable: <strong>Universidad Nacional de Colombia – Sede Orinoquía, Granja El Cairo</strong>,
          ciudad de Arauca, Colombia. Correo de contacto para temas de datos personales:{' '}
          <strong>granjaelcairo@unal.edu.co</strong>. Esta política se rige por la{' '}
          <strong>Ley 1581 de 2012</strong>, el <strong>Decreto 1377 de 2013</strong> y las instrucciones de la{' '}
          <strong>Superintendencia de Industria y Comercio (SIC)</strong>.
        </p>
      </LegalSection>

      <LegalSection title="2. Datos que recolectamos (solo los necesarios)">
        <p>En el formulario público de compra solicitamos únicamente:</p>
        <LegalList items={[
          'Identificación: tipo y número de documento.',
          'Contacto: nombre completo, número de celular y correo electrónico (opcional).',
          'Compra: productos y cantidades seleccionadas.',
          'Comprobante de pago: foto o PDF del comprobante para verificar la transacción.'
        ]} />
        <p>
          Las cuentas de administración (nombre, correo institucional y rol) son creadas
          internamente y no se recolectan datos de navegación con fines publicitarios.
        </p>
      </LegalSection>

      <LegalSection title="3. Finalidades">
        <LegalList items={[
          'Registrar y gestionar su pedido (cliente, venta y factura).',
          'Verificar el comprobante de pago y confirmar la venta.',
          'Coordinar la entrega de los productos mediante el código único de reclamo.',
          'Contactarlo sobre el estado de su pedido.'
        ]} />
      </LegalSection>

      <LegalSection title="4. Autorización">
        <p>
          Al marcar la casilla de aceptación en el formulario, usted otorga su{' '}
          <strong>autorización previa, expresa e informada</strong> para el tratamiento
          de sus datos con las finalidades descritas (art. 9, Ley 1581 de 2012).
          Sin esa aceptación el formulario no puede enviarse.
        </p>
      </LegalSection>

      <LegalSection title="5. Sus derechos (hábeas data)">
        <p>Usted puede, en cualquier momento y de forma gratuita:</p>
        <LegalList items={[
          'Conocer, actualizar y rectificar sus datos.',
          'Solicitar la supresión de sus datos o revocar la autorización.',
          'Ser informado sobre el uso dado a sus datos.',
          'Presentar quejas ante la Superintendencia de Industria y Comercio.'
        ]} />
        <p>
          Para ejercerlos escriba a <strong>granjaelcairo@unal.edu.co</strong> indicando
          su nombre, documento y solicitud. Respondemos dentro de los términos de ley.
        </p>
      </LegalSection>

      <LegalSection title="6. Seguridad">
        <LegalList items={[
          'Las contraseñas de administración se guardan cifradas (hash) y nunca se muestran.',
          'El acceso administrativo exige usuario, contraseña y sesión temporal (24 horas).',
          'El sitio opera con conexión cifrada HTTPS en producción.',
          'El acceso a los datos está limitado por roles (administrador de granja y superadministrador).'
        ]} />
      </LegalSection>

      <LegalSection title="7. Encargados y terceros">
        <p>
          Las fotos de comprobantes y productos se almacenan en <strong>Cloudinary</strong>,
          que actúa únicamente como encargado de almacenamiento bajo nuestras instrucciones.
          No vendemos ni compartimos sus datos con terceros con fines comerciales.
        </p>
      </LegalSection>

      <LegalSection title="8. Menores de edad">
        <p>
          El formulario de compra está dirigido a personas mayores de edad. No recolectamos
          deliberadamente datos de menores; si detectamos un caso, los eliminaremos.
        </p>
      </LegalSection>

      <LegalSection title="9. Vigencia">
        <p>
          Sus datos se conservan mientras dure la relación comercial y los términos
          legales de conservación de documentos contables y tributarios. Esta política
          puede actualizarse; la versión vigente estará siempre en{' '}
          <Link to="/privacidad" className="text-unal-primary hover:underline">esta página</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}