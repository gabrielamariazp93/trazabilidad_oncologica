import React, { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { fetchNotificaciones, marcarNotificacionLeida } from '../lib/api.js';
import { formatFechaHora } from '../lib/ui.js';

export default function NotificacionesPanel({ onAbrirCaso }) {
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const ref = useRef(null);

  async function cargar() {
    try {
      const data = await fetchNotificaciones();
      setNotificaciones(data.notificaciones);
    } catch {
      // silencioso: la campanita no debe romper el resto de la app
    }
  }

  useEffect(() => {
    cargar();
    const interval = setInterval(cargar, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickFuera(event) {
      if (ref.current && !ref.current.contains(event.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const noLeidas = notificaciones.filter((n) => !n.read).length;

  async function handleClick(n) {
    if (!n.read) await marcarNotificacionLeida(n.id);
    if (n.casoId) onAbrirCaso(n.casoId);
    setAbierto(false);
    cargar();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative text-slate-500 hover:text-slate-800"
      >
        <Bell className="w-5 h-5" />
        {noLeidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-30 max-h-96 overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
            Notificaciones
          </div>
          {notificaciones.length === 0 && (
            <div className="px-3 py-4 text-sm text-slate-400">Sin notificaciones.</div>
          )}
          {notificaciones.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-slate-50 hover:bg-slate-50 ${n.read ? 'text-slate-400' : 'text-slate-700 font-medium'}`}
            >
              <div>{n.text}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{formatFechaHora(n.createdAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
