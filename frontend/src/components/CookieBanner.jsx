import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';

const STORAGE_KEY = 'sivep-cookies-ok';

// Aviso informativo (no bloqueante): el sitio no usa cookies de seguimiento,
// solo almacenamiento técnico imprescindible (ver /cookies).
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch (e) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
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
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={dismiss} className="btn-primary text-sm px-4 py-2">
            Entendido
          </button>
          <button
            onClick={dismiss}
            className="p-2 rounded-lg hover:bg-gray-100 text-unal-secondary"
            aria-label="Cerrar aviso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}