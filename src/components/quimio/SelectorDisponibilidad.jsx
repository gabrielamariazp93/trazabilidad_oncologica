import React, { useEffect, useState, useCallback } from 'react';
import { fetchDisponibilidadQuimio } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import CalendarioMensual from './CalendarioMensual.jsx';
import AgendaDiaGrid from './AgendaDiaGrid.jsx';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Selector completo de sesión: calendario mensual (tipo Google Calendar, solo días hábiles
// seleccionables) + agenda del día elegido (AgendaDiaGrid, modo "reservar": solo bloques que
// alcanzan para duracionMin son clickeables). `value`/`onChange` manejan
// { fecha, sillonId, horaInicio }. Usado por TableroPaciente y AgendarCicloForm.
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
          <AgendaDiaGrid
            disponibilidad={disponibilidad}
            value={value}
            onSeleccionarLibre={(sillonId, horaInicio) => onChange({ fecha: fechaElegida, sillonId, horaInicio })}
            soloValidos
            compacto
          />
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
