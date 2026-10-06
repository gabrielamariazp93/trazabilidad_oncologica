import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchCiclo } from '../../lib/api.js';
import { formatFecha, formatFechaHora } from '../../lib/ui.js';

const ESTADO_STYLES = {
  programado: 'bg-slate-100 text-slate-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  listo_para_administrar: 'bg-indigo-100 text-indigo-700',
  en_administracion: 'bg-blue-100 text-blue-700',
  administrado: 'bg-emerald-100 text-emerald-700',
  suspendido: 'bg-orange-100 text-orange-700',
  cancelado: 'bg-red-100 text-red-700',
};

export default function DetalleCicloModal({ cicloId, onClose }) {
  const [ciclo, setCiclo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCiclo(cicloId)
      .then((data) => setCiclo(data.ciclo))
      .catch((err) => setError(err.message || 'No se pudo cargar el ciclo.'));
  }, [cicloId]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-30 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Detalle de la sesión</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!ciclo && !error && <div className="text-sm text-slate-400">Cargando…</div>}

          {ciclo && (
            <>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-slate-800">{ciclo.receta?.paciente?.nombre}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_STYLES[ciclo.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                    {ciclo.estadoLabel}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">RUT {ciclo.receta?.paciente?.rut} · {ciclo.receta?.protocolo}</div>
              </div>

              <div className="text-sm text-slate-600 grid grid-cols-2 gap-y-1">
                <div><span className="text-slate-400">Ciclo</span> {ciclo.numeroCiclo}</div>
                <div><span className="text-slate-400">Sillón</span> {ciclo.sillon?.nombre ?? '—'}</div>
                <div><span className="text-slate-400">Fecha</span> {formatFecha(ciclo.fechaProgramada)}</div>
                <div><span className="text-slate-400">Horario</span> {ciclo.horaInicio}–{ciclo.horaTermino}</div>
              </div>

              {ciclo.observaciones && (
                <div className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2">{ciclo.observaciones}</div>
              )}
              {ciclo.motivoSuspension && (
                <div className="text-sm text-orange-700 bg-orange-50 rounded-md px-3 py-2">Suspendido: {ciclo.motivoSuspension}</div>
              )}

              {!!ciclo.historial?.length && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Historial</div>
                  <div className="space-y-1">
                    {ciclo.historial.map((h) => (
                      <div key={h.id} className="text-xs text-slate-500">
                        {formatFechaHora(h.fecha)} — {h.estadoLabel}{h.actor ? ` · ${h.actor.name}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-400 pt-2">
                Para preparar, administrar o suspender esta sesión, ve a las pestañas Preparación / Administración.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
