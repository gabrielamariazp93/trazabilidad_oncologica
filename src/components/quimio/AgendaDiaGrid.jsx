import React from 'react';

// Grilla pura (sin fetch propio): sillones en columnas, bloques de 30 min en filas. La usan
// SelectorDisponibilidad (modo "reservar": solo los bloques que alcanzan para la duración
// elegida son clickeables) y SillonesGrilla (modo "explorar": cualquier bloque libre es
// clickeable, porque todavía no se sabe qué receta/duración se va a agendar ahí).
export default function AgendaDiaGrid({ disponibilidad, value, onSeleccionarLibre, onSeleccionarOcupado, soloValidos = true }) {
  if (!disponibilidad?.sillones?.length) {
    return <div className="text-sm text-slate-400">Sin sillones configurados.</div>;
  }

  return (
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
                  const puedeElegirLibre = !bloque.ocupado && (soloValidos ? bloque.valido : true);

                  let clase = 'bg-slate-50 text-slate-300';
                  if (bloque.ocupado) {
                    clase = 'bg-orange-100 text-orange-700 hover:bg-orange-200';
                  } else if (puedeElegirLibre) {
                    clase = seleccionado ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
                  }

                  const clickeable = bloque.ocupado ? !!onSeleccionarOcupado : puedeElegirLibre;

                  return (
                    <td key={sillon.id} className="p-0 border-b border-l border-slate-50">
                      <button
                        type="button"
                        disabled={!clickeable}
                        onClick={() => {
                          if (bloque.ocupado) onSeleccionarOcupado?.(sillon, bloque);
                          else onSeleccionarLibre?.(sillon.id, bloque.hora);
                        }}
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
  );
}
