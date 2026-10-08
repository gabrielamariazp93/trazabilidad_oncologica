import React, { useEffect, useState, useCallback } from 'react';
import { FlaskConical, CheckCircle2, Ban } from 'lucide-react';
import { fetchCiclos, transicionarCiclo } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';

const PUEDE_ACTUAR = ['quimico_farmaceutico', 'admin'];

export default function ColaPreparacion({ user }) {
  const [ciclos, setCiclos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [programados, enPreparacion] = await Promise.all([
        fetchCiclos({ estado: 'programado' }),
        fetchCiclos({ estado: 'en_preparacion' }),
      ]);
      const todos = [...programados.ciclos, ...enPreparacion.ciclos].sort((a, b) => new Date(a.fechaProgramada) - new Date(b.fechaProgramada));
      setCiclos(todos);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la cola de preparación.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeActuar = PUEDE_ACTUAR.includes(user.role);

  async function ejecutar(ciclo, accion, comentario) {
    setProcesando(ciclo.id);
    try {
      await transicionarCiclo(ciclo.id, { accion, comentario });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el ciclo.');
    } finally {
      setProcesando(null);
    }
  }

  function handleSuspender(ciclo) {
    const motivo = window.prompt('Motivo de la suspensión:');
    if (motivo && motivo.trim()) ejecutar(ciclo, 'suspender', motivo.trim());
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Cola de preparación — Químico Farmacéutico</h2>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {cargando && <div className="text-sm text-slate-400">Cargando…</div>}

      {!cargando && !ciclos.length && (
        <div className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-5">No hay ciclos pendientes de preparación.</div>
      )}

      <div className="space-y-3">
        {ciclos.map((ciclo) => (
          <div key={ciclo.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium text-slate-800">{ciclo.receta?.paciente?.nombre} — ciclo {ciclo.numeroCiclo}</div>
              <div className="text-xs text-slate-500">{ciclo.receta?.protocolo} · {formatFecha(ciclo.fechaProgramada)} {ciclo.horaInicio}–{ciclo.horaTermino}{ciclo.sillon ? ` · ${ciclo.sillon.nombre}` : ''}</div>
              <span className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${ciclo.estado === 'en_preparacion' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                {ciclo.estadoLabel}
              </span>
            </div>
            {puedeActuar && (
              <div className="flex items-center gap-2">
                {ciclo.estado === 'programado' && (
                  <button
                    type="button"
                    disabled={procesando === ciclo.id}
                    onClick={() => ejecutar(ciclo, 'iniciar_preparacion')}
                    className="flex items-center gap-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-md px-3 py-1.5"
                  >
                    <FlaskConical className="w-4 h-4" /> Iniciar preparación
                  </button>
                )}
                {ciclo.estado === 'en_preparacion' && (
                  <button
                    type="button"
                    disabled={procesando === ciclo.id}
                    onClick={() => ejecutar(ciclo, 'marcar_listo')}
                    className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Marcar listo
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
        ))}
      </div>
    </div>
  );
}
