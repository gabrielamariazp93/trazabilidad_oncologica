import React, { useEffect, useState, useCallback } from 'react';
import { Syringe, CheckCircle2, Ban } from 'lucide-react';
import { fetchCiclos, transicionarCiclo } from '../../lib/api.js';
import { formatFecha, formatFechaHora } from '../../lib/ui.js';

const PUEDE_ACTUAR = ['enfermera_quimio', 'admin'];

export default function ColaAdministracion({ user }) {
  const [ciclos, setCiclos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [cicloFinalizando, setCicloFinalizando] = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [reaccionAdversa, setReaccionAdversa] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [listos, enAdministracion] = await Promise.all([
        fetchCiclos({ estado: 'listo_para_administrar' }),
        fetchCiclos({ estado: 'en_administracion' }),
      ]);
      const todos = [...listos.ciclos, ...enAdministracion.ciclos].sort((a, b) => new Date(a.fechaProgramada) - new Date(b.fechaProgramada));
      setCiclos(todos);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la cola de administración.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeActuar = PUEDE_ACTUAR.includes(user.role);

  async function ejecutar(ciclo, accion, extra) {
    setProcesando(ciclo.id);
    try {
      await transicionarCiclo(ciclo.id, { accion, ...extra });
      setCicloFinalizando(null);
      setObservaciones('');
      setReaccionAdversa(false);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el ciclo.');
    } finally {
      setProcesando(null);
    }
  }

  function handleSuspender(ciclo) {
    const motivo = window.prompt('Motivo de la suspensión:');
    if (motivo && motivo.trim()) ejecutar(ciclo, 'suspender', { comentario: motivo.trim() });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Cola de administración — Enfermería</h2>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {cargando && <div className="text-sm text-slate-400">Cargando…</div>}

      {!cargando && !ciclos.length && (
        <div className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-5">No hay ciclos listos para administrar.</div>
      )}

      <div className="space-y-3">
        {ciclos.map((ciclo) => (
          <div key={ciclo.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-800">{ciclo.receta?.paciente?.nombre} — ciclo {ciclo.numeroCiclo}</div>
                <div className="text-xs text-slate-500">
                  {ciclo.receta?.protocolo} · {formatFecha(ciclo.fechaProgramada)} ({ciclo.turno}){ciclo.sillon ? ` · ${ciclo.sillon.nombre}` : ''}
                </div>
                {ciclo.fechaInicioReal && <div className="text-xs text-slate-400">Inicio real: {formatFechaHora(ciclo.fechaInicioReal)}</div>}
                <span className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${ciclo.estado === 'en_administracion' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {ciclo.estadoLabel}
                </span>
              </div>
              {puedeActuar && (
                <div className="flex items-center gap-2">
                  {ciclo.estado === 'listo_para_administrar' && (
                    <button
                      type="button"
                      disabled={procesando === ciclo.id}
                      onClick={() => ejecutar(ciclo, 'iniciar_administracion')}
                      className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md px-3 py-1.5"
                    >
                      <Syringe className="w-4 h-4" /> Iniciar administración
                    </button>
                  )}
                  {ciclo.estado === 'en_administracion' && cicloFinalizando !== ciclo.id && (
                    <button
                      type="button"
                      onClick={() => setCicloFinalizando(ciclo.id)}
                      className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Finalizar administración
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={procesando === ciclo.id}
                    onClick={() => handleSuspender(ciclo)}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-md px-3 py-1.5"
                  >
                    <Ban className="w-4 h-4" /> Suspender
                  </button>
                </div>
              )}
            </div>

            {cicloFinalizando === ciclo.id && (
              <div className="border-t border-slate-100 mt-3 pt-3 space-y-2">
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones de la administración"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
                  rows={2}
                />
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={reaccionAdversa} onChange={(e) => setReaccionAdversa(e.target.checked)} />
                  Hubo reacción adversa
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCicloFinalizando(null)} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
                  <button
                    type="button"
                    disabled={procesando === ciclo.id}
                    onClick={() => ejecutar(ciclo, 'finalizar_administracion', { observaciones, reaccionAdversa })}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md px-3 py-1.5"
                  >
                    Confirmar término
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
