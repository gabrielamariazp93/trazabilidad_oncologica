import React, { useState } from 'react';
import { CalendarClock, CheckCircle, Pencil } from 'lucide-react';
import { SEMAFORO_STYLES, formatFecha } from '../lib/ui.js';
import { actualizarPlazo } from '../lib/api.js';

export default function PlazosGesCard({ plazos, puedeEditar, onCambio }) {
  const [editandoId, setEditandoId] = useState(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!plazos?.length) {
    return <div className="text-sm text-slate-400">Este caso todavía no tiene plazos GES abiertos.</div>;
  }

  async function marcarCumplido(plazoId) {
    setGuardando(true);
    try {
      await actualizarPlazo(plazoId, { marcarCumplido: true });
      await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  async function guardarFechaLimite(plazoId) {
    setGuardando(true);
    try {
      await actualizarPlazo(plazoId, { fechaLimite: nuevaFecha });
      setEditandoId(null);
      await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plazos.map((plazo) => {
        const estilo = SEMAFORO_STYLES[plazo.semaforo] ?? SEMAFORO_STYLES.vigente;
        return (
          <div key={plazo.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <CalendarClock className="w-4 h-4 text-slate-400" />
                {plazo.label}
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${estilo.className}`}>{estilo.label}</span>
            </div>

            <div className="text-xs text-slate-500 mt-1.5">
              Inicio: {formatFecha(plazo.fechaInicio)} · Plazo: {plazo.diasPlazo} días
            </div>

            {editandoId === plazo.id ? (
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="date"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => guardarFechaLimite(plazo.id)}
                  className="text-xs bg-blue-600 text-white rounded-md px-2 py-1"
                >
                  Guardar
                </button>
                <button type="button" onClick={() => setEditandoId(null)} className="text-xs text-slate-500">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="text-sm text-slate-700">
                  Fecha límite: <span className="font-medium">{formatFecha(plazo.fechaLimite)}</span>
                </div>
                {puedeEditar && !plazo.fechaCumplimiento && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoId(plazo.id);
                      setNuevaFecha(new Date(plazo.fechaLimite).toISOString().slice(0, 10));
                    }}
                    className="text-slate-400 hover:text-slate-600"
                    title="Editar fecha límite"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {plazo.fechaCumplimiento ? (
              <div className="text-xs text-emerald-600 mt-1.5">Cumplido el {formatFecha(plazo.fechaCumplimiento)}</div>
            ) : (
              plazo.semaforo !== 'cumplido' &&
              puedeEditar && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => marcarCumplido(plazo.id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Marcar cumplido
                </button>
              )
            )}

            {!plazo.fechaCumplimiento && (
              <div className="text-xs text-slate-400 mt-1">
                {plazo.diasRestantes >= 0 ? `${plazo.diasRestantes} día(s) restantes` : `${Math.abs(plazo.diasRestantes)} día(s) de atraso`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
