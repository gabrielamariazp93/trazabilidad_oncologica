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
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-xs text-slate-400 font-medium border-b border-slate-200 min-w-[64px]">Hora</th>
            {disponibilidad.sillones.map((s) => (
              <th key={s.id} className="px-2 py-2 text-xs text-slate-500 font-medium border-b border-l border-slate-100 whitespace-nowrap min-w-[120px]">
                {s.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {disponibilidad.sillones[0]?.bloques.map((_, filaIdx) => {
            const hora = disponibilidad.sillones[0].bloques[filaIdx].hora;
            return (
              <tr key={hora}>
                <td className="sticky left-0 bg-white px-3 py-1.5 text-xs text-slate-500 border-b border-slate-50 whitespace-nowrap align-top">{hora}</td>
                {disponibilidad.sillones.map((sillon) => {
                  const bloque = sillon.bloques[filaIdx];
                  const seleccionado = value?.sillonId === sillon.id && value?.horaInicio === bloque.hora;
                  const puedeElegirLibre = !bloque.ocupado && (soloValidos ? bloque.valido : true);
                  const clickeable = bloque.ocupado ? !!onSeleccionarOcupado : puedeElegirLibre;

                  let clase = 'bg-white text-slate-300';
                  if (bloque.ocupado) {
                    clase = 'bg-orange-50 text-orange-700 hover:bg-orange-100';
                  } else if (puedeElegirLibre) {
                    clase = seleccionado ? 'bg-blue-600 text-white' : 'bg-white text-emerald-600 hover:bg-emerald-50';
                  }

                  return (
                    <td key={sillon.id} className="p-0 border-b border-l border-slate-50 align-top">
                      <button
                        type="button"
                        disabled={!clickeable}
                        onClick={() => {
                          if (bloque.ocupado) onSeleccionarOcupado?.(sillon, bloque);
                          else onSeleccionarLibre?.(sillon.id, bloque.hora);
                        }}
                        className={`w-full min-h-[34px] px-2 py-1 flex flex-col items-start justify-center text-left leading-tight ${clase} ${clickeable ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        {bloque.ocupado ? (
                          <>
                            <span className="font-medium text-xs truncate max-w-[104px]">{bloque.ciclo.pacienteNombre ?? 'Ocupado'} · C{bloque.ciclo.numeroCiclo}</span>
                            <span className="text-[10px] opacity-80">{bloque.ciclo.estadoLabel}</span>
                          </>
                        ) : puedeElegirLibre ? (
                          <span className="text-xs">—</span>
                        ) : (
                          <span className="text-xs text-slate-200">—</span>
                        )}
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
