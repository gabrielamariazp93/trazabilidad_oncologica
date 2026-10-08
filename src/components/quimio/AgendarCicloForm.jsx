import React, { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { fetchRecetas, crearCiclo } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import SelectorDisponibilidad from './SelectorDisponibilidad.jsx';
import PropuestaAgendamiento from './PropuestaAgendamiento.jsx';

function duracionSugerida(receta) {
  const minutosQuimio = (receta?.farmacos ?? [])
    .filter((f) => f.categoria === 'quimioterapia' && f.duracionInfusionMin)
    .reduce((sum, f) => sum + f.duracionInfusionMin, 0);
  return minutosQuimio > 0 ? minutosQuimio + 30 : 180;
}

// seleccionInicial: { fecha, sillonId, horaInicio, sillonNombre? } — cuando viene de un click en
// la grilla de SillonesGrilla, el horario ya está elegido. Si la receta elegida tiene más de un
// ciclo pendiente, se usa esa fecha como ancla para proponer automáticamente TODOS los ciclos
// restantes (PropuestaAgendamiento) en vez de agendar uno solo; "Agendar manualmente" vuelve al
// flujo de un ciclo a la vez.
export default function AgendarCicloForm({ fechaInicial, seleccionInicial, onClose, onCreado }) {
  const [recetas, setRecetas] = useState([]);
  const [recetaId, setRecetaId] = useState('');
  const [numeroCiclo, setNumeroCiclo] = useState(1);
  const [duracionEstimadaMin, setDuracionEstimadaMin] = useState(180);
  const [seleccion, setSeleccion] = useState(seleccionInicial ?? null);
  const [mostrarSelector, setMostrarSelector] = useState(!seleccionInicial);
  const [modoManual, setModoManual] = useState(false);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchRecetas({ estado: 'validada' }).then((data) => setRecetas(data.recetas));
  }, []);

  const receta = recetas.find((r) => r.id === recetaId) ?? null;
  const ciclosRestantes = receta ? receta.numeroCiclosTotal - (receta.ciclos?.length ?? 0) : 0;
  const usarPropuesta = receta && ciclosRestantes > 1 && !modoManual;

  useEffect(() => {
    if (receta) {
      setNumeroCiclo((receta.ciclos?.length ?? 0) + 1);
      setDuracionEstimadaMin(duracionSugerida(receta));
    }
    setModoManual(false);
  }, [recetaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!recetaId) {
      setError('Selecciona una receta validada.');
      return;
    }
    if (!seleccion) {
      setError('Elige un sillón y horario con cupo disponible.');
      return;
    }
    setGuardando(true);
    try {
      const data = await crearCiclo({
        recetaId,
        numeroCiclo: Number(numeroCiclo),
        fechaProgramada: seleccion.fecha,
        horaInicio: seleccion.horaInicio,
        sillonId: seleccion.sillonId,
        duracionEstimadaMin: Number(duracionEstimadaMin),
      });
      onCreado(data.ciclo);
    } catch (err) {
      setError(err.message || 'No se pudo agendar el ciclo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-20 px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Agendar ciclo</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Receta (solo validadas)</label>
            <select value={recetaId} onChange={(e) => setRecetaId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" required>
              <option value="">Selecciona una receta…</option>
              {recetas.map((r) => (
                <option key={r.id} value={r.id}>{r.paciente?.nombre} — {r.protocolo} ({r.ciclos?.length ?? 0}/{r.numeroCiclosTotal} ciclos)</option>
              ))}
            </select>
            {!recetas.length && <div className="text-xs text-amber-600 mt-1">No hay recetas validadas disponibles.</div>}
          </div>

          {usarPropuesta && (
            <PropuestaAgendamiento
              receta={receta}
              fechaInicioInicial={seleccionInicial?.fecha ?? fechaInicial}
              onAgendado={() => onCreado()}
              onCancelar={() => setModoManual(true)}
            />
          )}

          {receta && !usarPropuesta && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">N° de ciclo</label>
                    <input type="number" min="1" value={numeroCiclo} onChange={(e) => setNumeroCiclo(e.target.value)} className="w-24 border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Duración (min)</label>
                    <input type="number" min="15" value={duracionEstimadaMin} onChange={(e) => { setDuracionEstimadaMin(e.target.value); setSeleccion(null); setMostrarSelector(true); }} className="w-28 border border-slate-300 rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                {ciclosRestantes > 1 && (
                  <button type="button" onClick={() => setModoManual(false)} className="text-xs text-blue-600 hover:text-blue-800">
                    Usar propuesta automática
                  </button>
                )}
              </div>

              {seleccion && !mostrarSelector && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-sm text-blue-800">
                  <span>
                    Sesión: {formatFecha(seleccion.fecha)} · {seleccion.horaInicio} · {seleccion.sillonNombre ?? 'sillón elegido'}
                  </span>
                  <button type="button" onClick={() => setMostrarSelector(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                    <Pencil className="w-3 h-3" /> Cambiar
                  </button>
                </div>
              )}

              {mostrarSelector && (
                <SelectorDisponibilidad fechaInicial={seleccion?.fecha ?? fechaInicial} duracionMin={Number(duracionEstimadaMin) || 180} value={seleccion} onChange={(v) => { setSeleccion(v); if (v) setMostrarSelector(false); }} />
              )}

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
                <button type="submit" disabled={guardando || !seleccion} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2">
                  Agendar
                </button>
              </div>
            </form>
          )}

          {!receta && (
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
