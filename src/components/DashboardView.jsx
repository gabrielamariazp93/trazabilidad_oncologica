import React, { useEffect, useState, useCallback } from 'react';
import { Plus, AlertTriangle, Search } from 'lucide-react';
import { fetchCasos } from '../lib/api.js';
import { FASE_STYLES, SEMAFORO_STYLES, formatFecha } from '../lib/ui.js';
import NuevoCasoForm from './NuevoCasoForm.jsx';

const EDITOR_ROLES = ['admin', 'gestor_oncologico', 'enfermera_policlinico', 'admision'];

function peorSemaforo(plazos = []) {
  if (plazos.some((p) => p.semaforo === 'vencido')) return 'vencido';
  if (plazos.some((p) => p.semaforo === 'proximo')) return 'proximo';
  return null;
}

export default function DashboardView({ user, bootstrap, onAbrirCaso }) {
  const [casos, setCasos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtroFase, setFiltroFase] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = {};
      if (filtroFase) params.fase = filtroFase;
      if (filtroEstado) params.estado = filtroEstado;
      if (soloAlertas) params.soloAlertas = 'true';
      const data = await fetchCasos(params);
      setCasos(data.casos);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los casos.');
    } finally {
      setCargando(false);
    }
  }, [filtroFase, filtroEstado, soloAlertas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const casosFiltrados = casos.filter((caso) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return (
      caso.paciente?.nombre?.toLowerCase().includes(q) ||
      caso.paciente?.rut?.toLowerCase().includes(q) ||
      caso.patologiaSospecha?.toLowerCase().includes(q)
    );
  });

  const puedeCrear = EDITOR_ROLES.includes(user.role);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Casos oncológicos</h1>
        {puedeCrear && (
          <button
            type="button"
            onClick={() => setMostrarNuevo(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-3 py-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo caso
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por RUT o nombre"
            className="border border-slate-300 rounded-md pl-8 pr-3 py-1.5 text-sm w-56"
          />
        </div>
        <select
          value={filtroFase}
          onChange={(e) => setFiltroFase(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">Todas las fases</option>
          {bootstrap.fases.map((fase) => (
            <option key={fase.id} value={fase.id}>{fase.label}</option>
          ))}
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="activo">Activos</option>
          <option value="cerrado">Cerrados</option>
          <option value="">Todos</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Solo con alertas de plazo
        </label>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Paciente</th>
              <th className="text-left px-4 py-2.5">Patología</th>
              <th className="text-left px-4 py-2.5">Fase</th>
              <th className="text-left px-4 py-2.5">Hito actual</th>
              <th className="text-left px-4 py-2.5">Gestor</th>
              <th className="text-left px-4 py-2.5">Plazos</th>
              <th className="text-left px-4 py-2.5">Actualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            )}
            {!cargando && casosFiltrados.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No hay casos que coincidan con el filtro.</td></tr>
            )}
            {!cargando && casosFiltrados.map((caso) => {
              const semaforo = peorSemaforo(caso.plazos);
              return (
                <tr
                  key={caso.id}
                  onClick={() => onAbrirCaso(caso.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{caso.paciente?.nombre}</div>
                    <div className="text-xs text-slate-400">{caso.paciente?.rut}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{caso.patologiaSospecha}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FASE_STYLES[caso.fase] ?? 'bg-slate-100 text-slate-700'}`}>
                        {caso.faseLabel}
                      </span>
                      {caso.estado === 'cerrado' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700" title={caso.fechaCierre ? formatFecha(caso.fechaCierre) : undefined}>
                          Cerrado{caso.motivoCierreLabel ? ` — ${caso.motivoCierreLabel}` : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{caso.hitoLabel}</td>
                  <td className="px-4 py-2.5 text-slate-600">{caso.gestor?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {semaforo ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${SEMAFORO_STYLES[semaforo].className}`}>
                        <AlertTriangle className="w-3 h-3" />
                        {SEMAFORO_STYLES[semaforo].label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin alertas</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{formatFecha(caso.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mostrarNuevo && (
        <NuevoCasoForm
          onClose={() => setMostrarNuevo(false)}
          onCreado={(caso) => {
            setMostrarNuevo(false);
            onAbrirCaso(caso.id);
          }}
        />
      )}
    </div>
  );
}
