import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-unal-background py-12 px-4">
      <article className="max-w-3xl w-full mx-auto card p-6 sm:p-10">
        <Link to="/" className="inline-flex items-center gap-2 text-unal-secondary hover:text-unal-primary mb-6">
          <ArrowLeft className="w-5 h-5" />
          Volver al inicio
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-unal-secondary mb-2">{title}</h1>
        <p className="text-sm text-unal-secondary-light mb-8">Última actualización: {updated}</p>
        <div className="space-y-6 text-unal-secondary leading-relaxed">
          {children}
        </div>
      </article>
    </div>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-unal-secondary mb-2">{title}</h2>
      <div className="space-y-2 text-sm sm:text-base">{children}</div>
    </section>
  );
}

export function LegalList({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm sm:text-base">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}