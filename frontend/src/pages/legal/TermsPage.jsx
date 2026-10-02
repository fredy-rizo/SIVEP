import { Link } from 'react-router-dom';
import { LegalLayout, LegalSection, LegalList } from './LegalLayout';

export function TermsPage() {
  return (
    <LegalLayout title="Términos y Condiciones" updated="septiembre de 2026">
      <LegalSection title="1. Quiénes somos">
        <p>
          Este sitio es la tienda en línea de la <strong>Granja El Cairo</strong>, de la{' '}
          <strong>Universidad Nacional de Colombia – Sede Orinoquía</strong> (Arauca, Colombia).
          Contacto: <strong>granjaelcairo@unal.edu.co</strong>. Al usar el formulario de compra
          usted acepta estos términos, elaborados conforme a la <strong>Ley 1480 de 2011</strong>{' '}
          (Estatuto del Consumidor).
        </p>
      </LegalSection>

      <LegalSection title="2. Cómo comprar">
        <LegalList items={[
          'Seleccione los productos y cantidades disponibles en el formulario público.',
          'Complete sus datos de identificación y contacto.',
          'Adjunte la foto o PDF del comprobante de pago.',
          'Al enviar, el sistema crea su registro como cliente y su venta en estado pendiente.',
          'Nuestro equipo verifica el pago y confirma la venta.',
          'Recibirá un código único de reclamo: preséntelo para recoger sus productos.'
        ]} />
      </LegalSection>

      <LegalSection title="3. Precios y disponibilidad">
        <LegalList items={[
          'Los precios están en pesos colombianos (COP) e incluyen los impuestos aplicables.',
          'La disponibilidad está sujeta al stock de la granja; si un producto se agota, se lo informaremos antes de confirmar.',
          'Podemos corregir errores evidentes de precio o disponibilidad y ofrecerle reposición o devolución del dinero.'
        ]} />
      </LegalSection>

      <LegalSection title="4. Pagos">
        <p>
          El pago se acredita mediante el comprobante que usted adjunta. La venta solo queda
          confirmada cuando nuestro equipo verifica el pago. Mientras tanto su estado será
          «pendiente».
        </p>
      </LegalSection>

      <LegalSection title="5. Entrega y reclamo">
        <LegalList items={[
          'Cada compra genera un código único de reclamo ligado a su factura.',
          'Para recoger, presente su documento y su código; verificaremos que coincidan antes de entregar.',
          'Una vez entregados y revisados los productos en el punto de entrega, la venta se marca como entregada.'
        ]} />
      </LegalSection>

      <LegalSection title="6. Uso aceptable">
        <LegalList items={[
          'Está prohibido enviar comprobantes falsos o alterados; esos pedidos serán anulados.',
          'Está prohibido usar el formulario para fines distintos a la compra de nuestros productos.',
          'Nos reservamos el derecho de rechazar pedidos con información inconsistente.'
        ]} />
      </LegalSection>

      <LegalSection title="7. Responsabilidad">
        <p>
          Respondemos por la calidad e idoneidad de nuestros productos en los términos de la
          ley. No nos hacemos responsables por demoras causadas por datos de contacto
          incorrectos suministrados por el comprador ni por hechos de fuerza mayor.
        </p>
      </LegalSection>

      <LegalSection title="8. Cambios y ley aplicable">
        <p>
          Podemos actualizar estos términos; la versión vigente estará siempre publicada aquí.
          Se rigen por las leyes de la República de Colombia. Para reclamos y garantías, consulte
          nuestra <Link to="/reembolsos" className="text-unal-primary hover:underline">Política de Reembolsos</Link> y
          nuestra <Link to="/privacidad" className="text-unal-primary hover:underline">Política de Privacidad</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}