import React from 'react';

// Grilla pura (sin fetch propio): sillones en columnas, bloques de 30 min en filas. La usan
// SelectorDisponibilidad (modo "reservar": solo los bloques que alcanzan para la duración
// elegida son clickeables) y SillonesGrilla (modo "explorar": cualquier bloque libre es
// clickeable, porque todavía no se sabe qué receta/duración se va a agendar ahí).
//
// `compacto`: celdas pequeñas tipo "cuadritos de color" (sin texto, con title como tooltip) —
// pensado para el flujo de "Agendar ciclo" donde solo se necesita ver qué está libre. El modo
// espacioso (default, usado en la vista principal de Sillones) muestra el nombre del paciente
// directamente en cada celda ocupada.
export default function AgendaDiaGrid({ disponibilidad, value, onSeleccionarLibre, onSeleccionarOcupado, soloValidos = true, compacto = false }) {
  if (!disponibilidad?.sillones?.length) {
    return <div className="text-sm text-slate-400">Sin sillones configurados.</div>;
  }

  return (
    <div className="overflow-auto max-h-[65vh] border border-slate-200 rounded-lg min-w-0">
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr>
            <th className={`sticky top-0 left-0 z-30 bg-slate-50 text-left text-slate-400 font-medium border-b border-r border-slate-200 shadow-[2px_2px_4px_-2px_rgba(0,0,0,0.08)] ${compacto ? 'px-2 py-1 text-[10px] min-w-[52px]' : 'px-3 py-2 text-xs min-w-[64px]'}`}>
              Hora
            </th>
            {disponibilidad.sillones.map((s) => (
              <th
                key={s.id}
                className={`sticky top-0 z-20 bg-slate-50 text-slate-500 font-medium border-b border-l border-slate-100 whitespace-nowrap ${compacto ? 'px-1 py-1 text-[10px] min-w-[32px]' : 'px-2 py-2 text-xs min-w-[120px]'}`}
                title={compacto ? s.nombre : undefined}
              >
                {compacto ? s.nombre.replace(/[^0-9]/g, '') || s.nombre : s.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {disponibilidad.sillones[0]?.bloques.map((_, filaIdx) => {
            const hora = disponibilidad.sillones[0].bloques[filaIdx].hora;
            return (
              <tr key={hora}>
                <td className={`sticky left-0 z-10 bg-white text-slate-500 border-b border-r border-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] whitespace-nowrap align-middle ${compacto ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs align-top'}`}>
                  {hora}
                </td>
                {disponibilidad.sillones.map((sillon) => {
                  const bloque = sillon.bloques[filaIdx];
                  const seleccionado = value?.sillonId === sillon.id && value?.horaInicio === bloque.hora;
                  const puedeElegirLibre = !bloque.ocupado && (soloValidos ? bloque.valido : true);
                  const clickeable = bloque.ocupado ? !!onSeleccionarOcupado : puedeElegirLibre;

                  const handleClick = () => {
                    if (bloque.ocupado) onSeleccionarOcupado?.(sillon, bloque);
                    else onSeleccionarLibre?.(sillon.id, bloque.hora);
                  };

                  if (compacto) {
                    let claseCompacta = 'bg-slate-100';
                    if (bloque.ocupado) claseCompacta = 'bg-orange-400 hover:bg-orange-500';
                    else if (puedeElegirLibre) claseCompacta = seleccionado ? 'bg-blue-600' : 'bg-emerald-400 hover:bg-emerald-500';

                    const title = bloque.ocupado
                      ? `${bloque.ciclo.pacienteNombre ?? 'Ocupado'} · Ciclo ${bloque.ciclo.numeroCiclo} · ${bloque.ciclo.estadoLabel}`
                      : puedeElegirLibre ? 'Disponible' : undefined;

                    return (
                      <td key={sillon.id} className="p-0.5 border-b border-l border-slate-50 text-center">
                        <button
                          type="button"
                          disabled={!clickeable}
                          onClick={handleClick}
                          title={title}
                          className={`block mx-auto w-4 h-4 rounded-sm ${claseCompacta} ${clickeable ? 'cursor-pointer' : 'cursor-default'}`}
                        />
                      </td>
                    );
                  }

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
                        onClick={handleClick}
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
