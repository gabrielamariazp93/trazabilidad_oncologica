import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchRecetas, fetchSillones, crearCiclo } from '../../lib/api.js';

export default function AgendarCicloForm({ bootstrap, fechaInicial, onClose, onCreado }) {
  const [recetas, setRecetas] = useState([]);
  const [sillones, setSillones] = useState([]);
  const [recetaId, setRecetaId] = useState('');
  const [numeroCiclo, setNumeroCiclo] = useState(1);
  const [fechaProgramada, setFechaProgramada] = useState(fechaInicial ?? new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState(bootstrap.quimio.turnos[0]);
  const [sillonId, setSillonId] = useState('');
  const [duracionEstimadaMin, setDuracionEstimadaMin] = useState(180);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchRecetas({ estado: 'validada' }).then((data) => setRecetas(data.recetas));
    fetchSillones().then((data) => setSillones(data.sillones.filter((s) => s.activo)));
  }, []);

  useEffect(() => {
    const receta = recetas.find((r) => r.id === recetaId);
    if (receta) setNumeroCiclo((receta.ciclos?.length ?? 0) + 1);
  }, [recetaId, recetas]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!recetaId) {
      setError('Selecciona una receta validada.');
      return;
    }
    setGuardando(true);
    try {
      const data = await crearCiclo({
        recetaId,
        numeroCiclo: Number(numeroCiclo),
        fechaProgramada,
        turno,
        sillonId: sillonId || undefined,
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
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-20 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Agendar ciclo</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">N° de ciclo</label>
              <input type="number" min="1" value={numeroCiclo} onChange={(e) => setNumeroCiclo(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Duración (min)</label>
              <input type="number" min="15" value={duracionEstimadaMin} onChange={(e) => setDuracionEstimadaMin(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha</label>
              <input type="date" value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Turno</label>
              <select value={turno} onChange={(e) => setTurno(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                {bootstrap.quimio.turnos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Sillón</label>
              <select value={sillonId} onChange={(e) => setSillonId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                <option value="">Sin asignar todavía</option>
                {sillones.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
            <button type="submit" disabled={guardando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2">
              Agendar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
