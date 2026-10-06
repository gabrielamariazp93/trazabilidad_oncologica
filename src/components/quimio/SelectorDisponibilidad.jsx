import React, { useEffect, useState, useCallback } from 'react';
import { fetchDisponibilidadQuimio } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import CalendarioMensual from './CalendarioMensual.jsx';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Selector completo de sesión: calendario mensual (tipo Google Calendar, solo días hábiles
// seleccionables) + agenda del día elegido (sillones en columnas, bloques de 30 min en filas).
// `value`/`onChange` manejan { fecha, sillonId, horaInicio }. Usado por TableroPaciente y
// AgendarCicloForm para no duplicar esta lógica dos veces.
export default function SelectorDisponibilidad({ fechaInicial, duracionMin, value, onChange }) {
  const [fechaElegida, setFechaElegida] = useState(value?.fecha ?? fechaInicial ?? todayISO());
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargarDisponibilidad = useCallback(async () => {
    if (!fechaElegida) return;
    setCargando(true);
    setError(null);
    try {
      const data = await fetchDisponibilidadQuimio(fechaElegida, duracionMin);
      setDisponibilidad(data);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la disponibilidad.');
    } finally {
      setCargando(false);
    }
  }, [fechaElegida, duracionMin]);

  useEffect(() => {
    cargarDisponibilidad();
  }, [cargarDisponibilidad]);

  function handleSeleccionarFecha(iso) {
    setFechaElegida(iso);
    onChange(null);
  }

  function handleSeleccionarBloque(sillonId, hora) {
    onChange({ fecha: fechaElegida, sillonId, horaInicio: hora });
  }

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4">
      <div className="border border-slate-200 rounded-lg p-3">
        <CalendarioMensual fechaSeleccionada={fechaElegida} onSeleccionar={handleSeleccionarFecha} />
      </div>

      <div>
        <div className="text-sm font-medium text-slate-700 mb-2">{formatFecha(fechaElegida)}</div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {cargando && <div className="text-sm text-slate-400">Cargando agenda…</div>}

        {!cargando && disponibilidad && !disponibilidad.habil && (
          <div className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
            {disponibilidad.feriado ? 'Ese día es feriado.' : 'Ese día no es hábil.'} Elige otro día en el calendario.
          </div>
        )}

        {!cargando && disponibilidad?.habil && (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-50 px-2 py-1.5 text-left text-slate-400 font-medium border-b border-slate-200 min-w-[52px]">Hora</th>
                  {disponibilidad.sillones.map((s) => (
                    <th key={s.id} className="px-1.5 py-1.5 text-slate-500 font-medium border-b border-l border-slate-100 whitespace-nowrap">
                      {s.nombre.replace('Sillón ', 'S')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {disponibilidad.sillones[0]?.bloques.map((_, filaIdx) => {
                  const hora = disponibilidad.sillones[0].bloques[filaIdx].hora;
                  return (
                    <tr key={hora}>
                      <td className="sticky left-0 bg-white px-2 py-1 text-slate-500 border-b border-slate-50 whitespace-nowrap">{hora}</td>
                      {disponibilidad.sillones.map((sillon) => {
                        const bloque = sillon.bloques[filaIdx];
                        const seleccionado = value?.sillonId === sillon.id && value?.horaInicio === bloque.hora;
                        let clase = 'bg-slate-50 text-slate-300';
                        let clickeable = false;
                        if (bloque.ocupado) {
                          clase = 'bg-orange-100 text-orange-700';
                        } else if (bloque.valido) {
                          clase = seleccionado ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
                          clickeable = true;
                        }
                        return (
                          <td key={sillon.id} className="p-0 border-b border-l border-slate-50">
                            <button
                              type="button"
                              disabled={!clickeable}
                              onClick={() => handleSeleccionarBloque(sillon.id, bloque.hora)}
                              title={bloque.ciclo ? `${bloque.ciclo.pacienteNombre ?? 'Ocupado'} · ${bloque.ciclo.estadoLabel}` : undefined}
                              className={`w-8 h-6 flex items-center justify-center ${clase} ${clickeable ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {bloque.ocupado ? '●' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-50 border border-emerald-200 inline-block" /> Disponible</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-100 inline-block" /> Ocupado</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-50 inline-block" /> No alcanza la duración</span>
        </div>
      </div>
    </div>
  );
}
