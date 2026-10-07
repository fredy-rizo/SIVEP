import { useState } from 'react';
import { FileText, ExternalLink, ImageOff } from 'lucide-react';
import { resolveFileUrl } from '../utils/formatters';

// Visor de comprobantes de pago.
// - Imágenes (JPG/PNG/WEBP): se muestran directamente.
// - PDF: los <img> no pueden mostrarlos, así que se ofrece abrir/descargar.
// - Si la imagen falla al cargar: se muestra el error + enlace directo
//   (así el admin siempre puede acceder al archivo y diagnosticar).
export function ProofViewer({ url, customerName, customerDocument }) {
  const [failed, setFailed] = useState(false);
  const fullUrl = resolveFileUrl(url);
  const isPdf = (url || '').toLowerCase().split('?')[0].endsWith('.pdf');

  return (
    <div className="text-center">
      {isPdf ? (
        <div className="py-8">
          <FileText className="w-16 h-16 mx-auto text-unal-primary/60" />
          <p className="mt-4 text-unal-secondary font-medium">
            El comprobante es un documento PDF
          </p>
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2 mt-4"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir comprobante
          </a>
        </div>
      ) : !failed ? (
        <img
          src={fullUrl}
          alt="Comprobante de pago del cliente"
          className="max-w-full max-h-[70vh] mx-auto rounded-lg border border-gray-200 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="py-8">
          <ImageOff className="w-16 h-16 mx-auto text-unal-secondary-light" />
          <p className="mt-4 text-unal-secondary font-medium">
            No se pudo cargar la imagen aquí
          </p>
          <a
            href={fullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2 mt-4"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir en pestaña nueva
          </a>
          <p className="mt-3 text-xs text-unal-secondary-light break-all">
            {fullUrl}
          </p>
        </div>
      )}
      <p className="mt-4 text-sm text-unal-secondary-light">
        Cliente: {customerName} - {customerDocument}
      </p>
    </div>
  );
}