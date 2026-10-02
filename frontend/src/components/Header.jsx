import { Menu, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Header({ onMenuClick }) {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('sivep-theme') === 'dark';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('sivep-theme', dark ? 'dark' : 'light');
    } catch (e) {}
  }, [dark]);

  return (
    <header className="fixed top-0 right-0 left-0 h-16 bg-white border-b border-gray-200 z-40 flex items-center justify-between px-4 lg:ml-64">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-unal-secondary"
          aria-label="Abrir menú"
        >
          <Menu className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <h1 className="text-lg font-semibold text-unal-secondary hidden sm:block">
          Granja El Cairo - UNAL Orinoquía
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setDark(prev => !prev)}
          className="p-2 rounded-lg hover:bg-gray-100 text-unal-secondary transition-colors"
          aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={dark ? 'Modo claro' : 'Modo oscuro'}
        >
          {dark ? (
            <Sun className="w-5 h-5" strokeWidth={2.5} />
          ) : (
            <Moon className="w-5 h-5" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </header>
  );
}