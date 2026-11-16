import { useEffect, useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import api from '../utils/api';
import { resolveFileUrl } from '../utils/formatters';

// Visor de PDF: pide el comprobante al backend como blob y lo muestra con el
// visor nativo del navegador. Así no se abre otra pestaña y no depende de que
// Cloudinary permita entregar PDF directamente (si no, el backend arma un PDF
// con las páginas del documento).
function PdfViewer({ url, title }) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    setPdfUrl('');
    setError(false);

    api
      .get('/files/proof', { params: { url }, responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        const blob = new Blob([response.data], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (error) {
    return (
      <div className="py-8 text-center">
        <ImageOff className="w-16 h-16 mx-auto text-unal-secondary-light" />
        <p className="mt-4 text-unal-secondary font-medium">
          No se pudo cargar el comprobante
        </p>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <p className="py-12 text-center text-sm text-unal-secondary-light">
        Cargando comprobante...
      </p>
    );
  }

  return (
    <iframe
      src={pdfUrl}
      title={title}
      className="w-full h-[70vh] rounded-lg border border-gray-200 bg-white"
    />
  );
}

// Visor de comprobantes de pago.
// - Imágenes (JPG/PNG/WEBP): se muestran directamente.
// - PDF: se muestra con el visor nativo del navegador, dentro del modal.
// - Si la imagen falla al cargar: se muestra el error + enlace directo.
export function ProofViewer({ url, customerName, customerDocument }) {
  const [failed, setFailed] = useState(false);
  const fullUrl = resolveFileUrl(url);
  const isPdf = (url || '').toLowerCase().split('?')[0].endsWith('.pdf');

  return (
    <div className="text-center">
      {isPdf ? (
        <PdfViewer
          key={url}
          url={url}
          title={`Comprobante de pago ${customerName || ''}`}
        />
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
