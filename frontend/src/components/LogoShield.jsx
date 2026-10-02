import { useState } from 'react';

// Escudo oficial de la Universidad Nacional de Colombia.
//
// PARA ACTIVARLO: guarde la imagen del escudo que se compartió en el chat como:
//   frontend/public/escudo-unal.png
// (formato PNG, idealmente cuadrado o recortado al escudo).
//
// Mientras ese archivo no exista, el componente muestra automáticamente la
// marca temporal (globo) para no romper el diseño en ningún punto.
export function LogoShield({ className = 'w-10 h-10' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${className} bg-unal-primary rounded-lg flex items-center justify-center flex-shrink-0`}
        role="img"
        aria-label="SIVEP - Granja El Cairo"
      >
        <svg className="w-3/5 h-3/5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-0.5 flex items-center justify-center flex-shrink-0 shadow-sm">
      <img
        src="/escudo-unal.png"
        alt="Escudo de la Universidad Nacional de Colombia"
        className={`${className} object-contain`}
        onError={() => setFailed(true)}
      />
    </div>
  );
}