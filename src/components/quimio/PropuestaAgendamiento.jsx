import React, { useEffect, useState, useCallback } from 'react';
import { CalendarCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchPropuestaAgendamiento, agendarPropuesta, fetchSillones } from '../../lib/api.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Propuesta automática de agendamiento para TODOS los ciclos restantes de una receta de una
// sola vez: calcula fecha/hora/sillón según intervaloDias del esquema y la disponibilidad real
// del calendario (backend), y deja cada fila editable antes de aceptar — así la enfermera no
// tiene que agendar ciclo por ciclo cuando el esquema tiene varios.
export default function PropuestaAgendamiento({ receta, fechaInicioInicial, onAgendado, onCancelar }) {
  const [fechaInicio, setFechaInicio] = useState(fechaInicioInicial ?? todayISO());
  const [propuestas, setPropuestas] = useState([]);
  const [duracionMin, setDuracionMin] = useState(180);
  const [sillones, setSillones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(null);

  useEffect(() => {
    fetchSillones().then((data) => setSillones(data.sillones)).catch(() => {});
  }, []);

  const cargarPropuesta = useCallback(async () => {
    setCargando(true);
    setError(null);
    setExito(null);
    try {
      const data = await fetchPropuestaAgendamiento(receta.id, { fechaInicio });
      setPropuestas(data.propuestas.map((p) => ({ ...p })));
      setDuracionMin(data.duracionMin || 180);
    } catch (err) {
      setError(err.message || 'No se pudo calcular la propuesta.');
    } finally {
      setCargando(false);
    }
  }, [receta.id, fechaInicio]);

  useEffect(() => {
    cargarPropuesta();
  }, [cargarPropuesta]);

  function actualizarFila(idx, cambios) {
    setPropuestas((prev) => prev.map((p, i) => (i === idx ? { ...p, ...cambios, error: undefined } : p)));
  }

  const filasIncompletas = propuestas.some((p) => !p.fechaProgramada || !p.horaInicio);

  async function handleAceptar() {
    setError(null);
    setGuardando(true);
    try {
      const data = await agendarPropuesta(receta.id, {
        duracionEstimadaMin: duracionMin,
        ciclos: propuestas.map((p) => ({
          numeroCiclo: p.numeroCiclo,
          fechaProgramada: p.fechaProgramada,
          horaInicio: p.horaInicio,
          sillonId: p.sillonId || null,
        })),
      });
      setExito(`${data.ciclosCreados} ciclo(s) agendado(s).`);
      onAgendado?.();
    } catch (err) {
      setError(err.message || 'No se pudo agendar la propuesta.');
    } finally {
      setGuardando(false);
    }
  }

  if (!propuestas.length && !cargando) {
    return (
      <div className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-4">
        No quedan ciclos por agendar en esta receta.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <CalendarCheck className="w-4 h-4" /> Propuesta de agendamiento ({propuestas.length} ciclo{propuestas.length === 1 ? '' : 's'})
        </h4>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Desde</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1 text-xs" />
          <button type="button" onClick={cargarPropuesta} disabled={cargando} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Recalcular
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Propuesta automática según el intervalo del esquema ({receta.intervaloDias} días) y la disponibilidad del calendario de sillones. Puedes editar cualquier fila antes de aceptar.
      </p>

      {cargando && <div className="text-sm text-slate-400">Calculando…</div>}

      {!cargando && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="text-xs text-slate-400 text-left">
                <th className="py-1.5 pr-2">Ciclo</th>
                <th className="py-1.5 pr-2">Fecha</th>
                <th className="py-1.5 pr-2">Hora</th>
                <th className="py-1.5 pr-2">Sillón</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {propuestas.map((p, idx) => (
                <tr key={p.numeroCiclo} className={p.error ? 'bg-amber-50' : ''}>
                  <td className="py-1.5 pr-2 font-medium text-slate-700">{p.numeroCiclo}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="date"
                      value={p.fechaProgramada ?? ''}
                      onChange={(e) => actualizarFila(idx, { fechaProgramada: e.target.value })}
                      className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="time"
                      value={p.horaInicio ?? ''}
                      onChange={(e) => actualizarFila(idx, { horaInicio: e.target.value })}
                      className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={p.sillonId ?? ''}
                      onChange={(e) => actualizarFila(idx, { sillonId: e.target.value })}
                      className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                    >
                      <option value="">Sin sillón</option>
                      {sillones.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </td>
                  {p.error && (
                    <td className="py-1.5 pl-1">
                      <span className="flex items-center gap-1 text-[11px] text-amber-700" title={p.error}>
                        <AlertTriangle className="w-3 h-3" /> Completa manualmente
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {exito && <div className="text-sm text-emerald-600 mb-2">{exito}</div>}

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="text-sm text-slate-500 px-3 py-1.5">
            Agendar manualmente
          </button>
        )}
        <button
          type="button"
          disabled={cargando || guardando || filasIncompletas || !propuestas.length}
          onClick={handleAceptar}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-4 py-2"
        >
          Aceptar y agendar {propuestas.length} ciclo{propuestas.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}
