import React, { useEffect, useState, useCallback } from 'react';
import { Activity } from 'lucide-react';
import { fetchMe, fetchBootstrap, getAuthToken, logout as apiLogout } from './lib/api.js';
import LoginView from './components/LoginView.jsx';
import DashboardView from './components/DashboardView.jsx';
import CasoDetailView from './components/CasoDetailView.jsx';
import NotificacionesPanel from './components/NotificacionesPanel.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [casoSeleccionadoId, setCasoSeleccionadoId] = useState(null);

  const cargarSesion = useCallback(async () => {
    setLoading(true);
    try {
      if (getAuthToken()) {
        const [{ user: me }, data] = await Promise.all([fetchMe(), fetchBootstrap()]);
        setUser(me);
        setBootstrap(data);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarSesion();
  }, [cargarSesion]);

  async function handleLoggedIn(me) {
    setUser(me);
    const data = await fetchBootstrap();
    setBootstrap(data);
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // token ya inválido, igual limpiamos estado local
    }
    setUser(null);
    setBootstrap(null);
    setCasoSeleccionadoId(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Cargando...
      </div>
    );
  }

  if (!user || !bootstrap) {
    return <LoginView onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 text-slate-800 font-semibold"
            onClick={() => setCasoSeleccionadoId(null)}
          >
            <Activity className="w-5 h-5 text-blue-600" />
            Trazabilidad Oncológica
          </button>
          <div className="flex items-center gap-4">
            <NotificacionesPanel onAbrirCaso={setCasoSeleccionadoId} />
            <div className="text-sm text-right">
              <div className="font-medium text-slate-800">{user.name}</div>
              <div className="text-slate-500">{bootstrap.roles.find((r) => r.id === user.role)?.label ?? user.role}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-3 py-1.5"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {casoSeleccionadoId ? (
          <CasoDetailView
            casoId={casoSeleccionadoId}
            user={user}
            bootstrap={bootstrap}
            onVolver={() => setCasoSeleccionadoId(null)}
          />
        ) : (
          <DashboardView user={user} bootstrap={bootstrap} onAbrirCaso={setCasoSeleccionadoId} />
        )}
      </main>
    </div>
  );
}
