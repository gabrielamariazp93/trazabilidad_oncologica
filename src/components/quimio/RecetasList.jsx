import React, { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { fetchRecetas, fetchReceta } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import RecetaForm from './RecetaForm.jsx';
import RecetaDetail from './RecetaDetail.jsx';

const ESTADO_STYLES = {
  borrador: 'bg-slate-100 text-slate-700',
  validada: 'bg-emerald-100 text-emerald-700',
  rechazada: 'bg-red-100 text-red-700',
  anulada: 'bg-slate-200 text-slate-600',
};

export default function RecetasList({ user, bootstrap }) {
  const [recetas, setRecetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [recetaSeleccionada, setRecetaSeleccionada] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await fetchRecetas(filtroEstado ? { estado: filtroEstado } : {});
      setRecetas(data.recetas);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las recetas.');
    } finally {
      setCargando(false);
    }
  }, [filtroEstado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abrirReceta(id) {
    const data = await fetchReceta(id);
    setRecetaSeleccionada(data.receta);
  }

  if (recetaSeleccionada) {
    return (
      <RecetaDetail
        receta={recetaSeleccionada}
        user={user}
        onVolver={() => setRecetaSeleccionada(null)}
        onCambio={async () => {
          await abrirReceta(recetaSeleccionada.id);
          cargar();
        }}
      />
    );
  }

  const puedeCrear = user.role === 'oncologo' || user.role === 'admin';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Recetas de quimioterapia</h2>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos los estados</option>
            {bootstrap.quimio.estadosReceta.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </div>
        {puedeCrear && (
          <button type="button" onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-3 py-2">
            <Plus className="w-4 h-4" /> Nueva receta
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Paciente</th>
              <th className="text-left px-4 py-2.5">Protocolo</th>
              <th className="text-left px-4 py-2.5">Estado</th>
              <th className="text-left px-4 py-2.5">Ciclos</th>
              <th className="text-left px-4 py-2.5">Actualizada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>}
            {!cargando && !recetas.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No hay recetas.</td></tr>}
            {!cargando && recetas.map((r) => (
              <tr key={r.id} onClick={() => abrirReceta(r.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{r.paciente?.nombre}</div>
                  <div className="text-xs text-slate-400">{r.paciente?.rut}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.protocolo}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_STYLES[r.estado] ?? 'bg-slate-100 text-slate-700'}`}>{r.estadoLabel}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{r.ciclos?.length ?? 0} / {r.numeroCiclosTotal}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatFecha(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarForm && (
        <RecetaForm
          bootstrap={bootstrap}
          onClose={() => setMostrarForm(false)}
          onCreada={(receta) => {
            setMostrarForm(false);
            cargar();
            abrirReceta(receta.id);
          }}
        />
      )}
    </div>
  );
}
