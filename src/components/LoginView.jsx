import React, { useState } from 'react';
import { Activity, LogIn } from 'lucide-react';
import { login, demoLogin, fetchMe } from '../lib/api.js';

const DEMO_ROLES = [
  { id: 'admin', label: 'Administrador' },
  { id: 'gestor_oncologico', label: 'Gestor Oncológico' },
  { id: 'enfermera_policlinico', label: 'Enfermera de Policlínico' },
  { id: 'admision', label: 'Admisión' },
  { id: 'ges', label: 'GES' },
  { id: 'lectura', label: 'Lectura' },
];

export default function LoginView({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const data = await login(email, password);
      await onLoggedIn(data.user);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  async function handleDemo(role) {
    setError(null);
    setCargando(true);
    try {
      const data = await demoLogin(role);
      await onLoggedIn(data.user);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión demo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 text-slate-800">
          <Activity className="w-6 h-6 text-blue-600" />
          <h1 className="text-lg font-semibold">Trazabilidad Oncológica</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="gestora@hospital.local"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="demo123"
              required
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={cargando}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-3 py-2"
          >
            <LogIn className="w-4 h-4" />
            Iniciar sesión
          </button>
        </form>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Acceso demo por rol</div>
          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_ROLES.map((role) => (
              <button
                key={role.id}
                type="button"
                disabled={cargando}
                onClick={() => handleDemo(role.id)}
                className="text-sm text-left border border-slate-200 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
