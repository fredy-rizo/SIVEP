import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/FormComponents';
import { LogoShield } from '../components/LogoShield';
import { Eye, EyeOff } from 'lucide-react';
import toast from '../utils/toast';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/dashboard';
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) {
      newErrors.email = 'El correo es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Correo inválido';
    }
    if (!formData.password) {
      newErrors.password = 'La contraseña es obligatoria';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    const result = await login(formData.email, formData.password);
    if (result.success) {
      navigate(from, { replace: true });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-unal-background flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full card p-6 sm:p-8">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-unal-secondary hover:text-unal-primary mb-6">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al inicio
          </Link>
          <div className="mx-auto mb-4 w-fit">
            <LogoShield className="w-14 h-14" />
          </div>
          <h1 className="text-2xl font-bold text-unal-secondary">Iniciar sesión</h1>
          <p className="text-unal-secondary-light mt-2">SIVEP - Granja El Cairo</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <Input
            label="Correo electrónico"
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            error={errors.email}
            required
            placeholder="admin@sivep.unal.edu.co"
            autoComplete="email"
            autoFocus
          />

          <div className="relative">
            <Input
              label="Contraseña"
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              error={errors.password}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-unal-secondary-light hover:text-unal-secondary"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Iniciando sesión...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium text-unal-secondary mb-2">Credenciales de prueba:</p>
          <div className="space-y-1 text-unal-secondary-light font-mono text-xs">
            <p>Super Admin: <span className="font-mono">superadmin@sivep.unal.edu.co</span> / <span className="font-mono">Sivep2026*Admin</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}