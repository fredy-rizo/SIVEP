import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { PublicFormPage } from './pages/PublicFormPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SalesPage } from './pages/SalesPage';
import { NewSalePage } from './pages/NewSalePage';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { InventoryPage } from './pages/InventoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { PrivacyPage } from './pages/legal/PrivacyPage';
import { TermsPage } from './pages/legal/TermsPage';
import { RefundsPage } from './pages/legal/RefundsPage';
import { CookiesPage } from './pages/legal/CookiesPage';
import { CookieBanner } from './components/CookieBanner';
import { useAuth } from './context/AuthContext';

function PrivateRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-unal-background">
        <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin_granja']}>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/ventas" element={<SalesPage />} />
        <Route path="/ventas/nueva" element={<NewSalePage />} />
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/clientes" element={<CustomersPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/reportes" element={<ReportsPage />} />
        <Route path="/usuarios" element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <UsersPage />
          </ProtectedRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function PublicRoutes() {
  return (
    <>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/formulario-compra" element={<PublicFormPage />} />
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/reembolsos" element={<RefundsPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <CookieBanner />
  </>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-unal-background">
        <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return user ? <PrivateRoutes /> : <PublicRoutes />;
}