import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FASE_STYLES, formatFechaHora } from '../lib/ui.js';

export default function TimelineHitos({ hitos }) {
  if (!hitos?.length) {
    return <div className="text-sm text-slate-400">Sin avances registrados todavía.</div>;
  }

  const ordenados = [...hitos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return (
    <ol className="space-y-4">
      {ordenados.map((hito) => (
        <li key={hito.id} className="flex gap-3">
          <div className="mt-0.5">
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{hito.hitoLabel}</span>
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${FASE_STYLES[hito.fase] ?? 'bg-slate-100 text-slate-700'}`}>
                {hito.faseLabel}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {formatFechaHora(hito.fecha)}{hito.actor ? ` · ${hito.actor.name}` : ''}
            </div>
            {hito.comentario && <div className="text-sm text-slate-600 mt-0.5">{hito.comentario}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
