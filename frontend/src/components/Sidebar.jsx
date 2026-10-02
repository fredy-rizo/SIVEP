import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogoShield } from './LogoShield';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  AlertTriangle,
  ClipboardList,
  PlusCircle,
  X
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Ventas', href: '/ventas', icon: ShoppingCart },
  { name: 'Nueva Venta', href: '/ventas/nueva', icon: PlusCircle },
  { name: 'Productos', href: '/productos', icon: Package },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Inventario', href: '/inventario', icon: ClipboardList },
  { name: 'Reportes', href: '/reportes', icon: BarChart3 },
];

const superAdminNavigation = [
  { name: 'Usuarios', href: '/usuarios', icon: Settings }
];

export function Sidebar({ open = false, onClose }) {
  const { user, logout, isSuperAdmin } = useAuth();
  const location = useLocation();

  const items = [...navigation];
  if (isSuperAdmin) {
    items.push(...superAdminNavigation);
  }

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-white border-r border-gray-200
      flex flex-col transition-transform duration-300
      ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
    `}>
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <LogoShield className="w-10 h-10" />
          <span className="font-bold text-unal-primary text-lg">SIVEP</span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-unal-secondary"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={({ isActive: active }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-unal-primary text-white'
                  : 'text-unal-secondary hover:bg-gray-100 hover:text-unal-primary'
                }
              `}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 px-3 py-2 mb-3">
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-unal-secondary">
              {user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-unal-secondary truncate">{user?.full_name}</p>
            <p className="text-xs text-unal-secondary-light capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-unal-secondary hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" strokeWidth={2.5} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}