import React, { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { registrarNota } from '../lib/api.js';
import { formatFechaHora } from '../lib/ui.js';

const ROL_BADGE_STYLES = {
  admin: 'bg-slate-100 text-slate-700',
  gestor_oncologico: 'bg-blue-100 text-blue-700',
  enfermera_policlinico: 'bg-teal-100 text-teal-700',
  admision: 'bg-amber-100 text-amber-700',
  ges: 'bg-purple-100 text-purple-700',
  lectura: 'bg-slate-100 text-slate-500',
};

export default function NotasCaso({ casoId, notas, puedeEscribir, onCambio }) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const ordenadas = [...(notas ?? [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!texto.trim()) return;
    setError(null);
    setGuardando(true);
    try {
      await registrarNota(casoId, { texto: texto.trim() });
      setTexto('');
      await onCambio();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-3 max-h-72 overflow-y-auto">
        {ordenadas.length === 0 && <div className="text-sm text-slate-400">Sin notas todavía.</div>}
        {ordenadas.map((nota) => (
          <div key={nota.id} className="border-b border-slate-50 pb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{nota.autor?.name ?? 'Usuario eliminado'}</span>
              {nota.autor?.roleLabel && (
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${ROL_BADGE_STYLES[nota.autor.role] ?? 'bg-slate-100 text-slate-600'}`}>
                  {nota.autor.roleLabel}
                </span>
              )}
              <span className="text-xs text-slate-400">{formatFechaHora(nota.createdAt)}</span>
            </div>
            <div className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{nota.texto}</div>
          </div>
        ))}
      </div>

      {puedeEscribir && (
        <form onSubmit={handleSubmit} className="space-y-2 border-t border-slate-100 pt-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Agregar una nota para el resto del equipo…"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            rows={2}
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={guardando || !texto.trim()}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <MessageSquarePlus className="w-4 h-4" /> Agregar nota
          </button>
        </form>
      )}
    </div>
  );
}
