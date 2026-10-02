import { LegalLayout, LegalSection, LegalList } from './LegalLayout';

export function RefundsPage() {
  return (
    <LegalLayout title="Política de Reembolsos y Devoluciones" updated="septiembre de 2026">
      <LegalSection title="1. Nuestro compromiso">
        <p>
          Si recibe un producto en mal estado o distinto al facturado, lo reponemos o le
          devolvemos su dinero, conforme a la <strong>Ley 1480 de 2011</strong> (Estatuto
          del Consumidor). Para iniciar cualquier solicitud escriba a{' '}
          <strong>granjaelcairo@unal.edu.co</strong> indicando su número de factura o código
          de reclamo.
        </p>
      </LegalSection>

      <LegalSection title="2. Casos cubiertos">
        <LegalList items={[
          'Producto en mal estado o no apto al momento de la entrega.',
          'Producto distinto al facturado o cantidad incompleta.',
          'Cobro por un valor diferente al confirmado.'
        ]} />
      </LegalSection>

      <LegalSection title="3. Cómo reclamar">
        <LegalList items={[
          'Reporte el caso lo antes posible, idealmente al momento de recoger.',
          'Conserve el producto y la factura o código de reclamo.',
          'Envíenos fotos del producto y una breve descripción del problema.',
          'Respondemos su reclamación dentro de los quince (15) días hábiles siguientes.'
        ]} />
      </LegalSection>

      <LegalSection title="4. Soluciones">
        <p>Verificado el caso, usted podrá elegir entre:</p>
        <LegalList items={[
          'Reposición del producto por uno en buen estado.',
          'Devolución total del dinero pagado por ese producto, por el mismo medio de pago.'
        ]} />
      </LegalSection>

      <LegalSection title="5. Derecho de retracto">
        <p>
          En las compras por medios no tradicionales usted cuenta con el derecho de retracto
          en los términos y plazos de la ley vigente, salvo las excepciones legales aplicables
          a cada tipo de producto. Consúltenos su caso concreto antes de que la venta sea
          confirmada y entregada.
        </p>
      </LegalSection>

      <LegalSection title="6. Casos no cubiertos">
        <LegalList items={[
          'Deterioro por mal almacenamiento o manipulación posterior a una entrega verificada.',
          'Reclamos sin factura, código de reclamo o evidencia del problema.',
          'Arrepentimiento simple después de una entrega verificada sin defectos, fuera de los casos legales de retracto.'
        ]} />
      </LegalSection>
    </LegalLayout>
  );
}