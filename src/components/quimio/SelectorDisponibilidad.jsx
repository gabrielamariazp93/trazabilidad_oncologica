import React, { useEffect, useState } from 'react';
import { Armchair } from 'lucide-react';
import { fetchDisponibilidadQuimio } from '../../lib/api.js';

// Dado fecha + duracionMin, muestra botones de sillón+hora con los bloques realmente libres ese
// día (calculados en el backend contra el calendario real y los ciclos ya agendados). Usado por
// TableroPaciente y AgendarCicloForm para no duplicar esta lógica dos veces.
export default function SelectorDisponibilidad({ fecha, duracionMin, value, onChange }) {
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fecha) return;
    let cancelado = false;
    fetchDisponibilidadQuimio(fecha, duracionMin)
      .then((data) => {
        if (!cancelado) setDisponibilidad(data);
      })
      .catch((err) => {
        if (!cancelado) setError(err.message || 'No se pudo cargar la disponibilidad.');
      });
    return () => {
      cancelado = true;
    };
  }, [fecha, duracionMin]);

  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!disponibilidad) return <div className="text-sm text-slate-400">Cargando disponibilidad…</div>;

  if (!disponibilidad.habil) {
    return (
      <div className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
        {disponibilidad.feriado ? 'Ese día es feriado.' : 'Ese día no es hábil.'} Elige otra fecha.
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-slate-400 mb-1.5">
        Horario hábil: {disponibilidad.horaInicio}–{disponibilidad.horaFin}
      </div>
      <div className="space-y-2">
        {disponibilidad.sillones.map((sillon) => (
          <div key={sillon.id}>
            <div className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
              <Armchair className="w-3.5 h-3.5" /> {sillon.nombre}
            </div>
            {sillon.bloques.length ? (
              <div className="flex flex-wrap gap-1">
                {sillon.bloques.map((hora) => {
                  const seleccionado = value?.sillonId === sillon.id && value?.horaInicio === hora;
                  return (
                    <button
                      type="button"
                      key={hora}
                      onClick={() => onChange({ sillonId: sillon.id, horaInicio: hora })}
                      className={`text-xs rounded-md px-2 py-1 border ${
                        seleccionado
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {hora}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-300">sin cupo</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
