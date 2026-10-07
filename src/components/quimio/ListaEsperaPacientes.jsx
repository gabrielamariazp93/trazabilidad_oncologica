import React, { useEffect, useState } from 'react';
import { fetchPacientesEspera } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';

const ESTADO_STYLES = {
  borrador: 'bg-slate-100 text-slate-700',
  validada: 'bg-emerald-100 text-emerald-700',
};

// Panel al costado del calendario general de Sillones: pacientes con receta de quimio activa
// (borrador esperando validación, o validada en tratamiento), ordenados por antigüedad de
// ingreso — el que lleva más tiempo esperando aparece primero. `refreshKey` fuerza un refetch
// cuando algo cambia en la agenda (agendar, reprogramar, suspender, cancelar).
export default function ListaEsperaPacientes({ refreshKey }) {
  const [pacientes, setPacientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetchPacientesEspera()
      .then((data) => setPacientes(data.pacientes))
      .catch((err) => setError(err.message || 'No se pudo cargar la lista de espera.'))
      .finally(() => setCargando(false));
  }, [refreshKey]);

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-slate-700">Pacientes oncológicos</h3>
      <div className="text-[11px] text-slate-400 mb-2">Ordenados por orden de espera</div>

      {cargando && <div className="text-sm text-slate-400">Cargando…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!cargando && !error && !pacientes.length && (
        <div className="text-sm text-slate-400">No hay pacientes en espera todavía.</div>
      )}

      <div className="space-y-2 max-h-[520px] overflow-y-auto">
        {pacientes.map((p, idx) => (
          <div key={p.recetaId} className="text-sm border-b border-slate-50 pb-2 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700 truncate">{idx + 1}. {p.pacienteNombre}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${ESTADO_STYLES[p.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                {p.estadoLabel}
              </span>
            </div>
            <div className="text-xs text-slate-500">{p.protocolo} · {p.ciclosCompletados}/{p.ciclosTotal} ciclos</div>
            <div className="text-xs text-slate-400">
              {p.proximaSesion ? `Próxima sesión: ${formatFecha(p.proximaSesion.fecha)} ${p.proximaSesion.horaInicio}` : 'Sin próxima sesión agendada'}
              {' · '}{p.diasEnEspera} día{p.diasEnEspera === 1 ? '' : 's'} esperando
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
