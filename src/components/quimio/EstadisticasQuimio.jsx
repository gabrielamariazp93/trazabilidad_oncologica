import React, { useEffect, useState, useCallback } from 'react';
import { Download } from 'lucide-react';
import { fetchEstadisticasQuimio, descargarEstadisticasQuimio } from '../../lib/api.js';

function haceDiasISO(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const GROUP_BY_OPCIONES = [
  { id: 'protocolo', label: 'Protocolo' },
  { id: 'farmaco', label: 'Fármaco' },
  { id: 'sillon', label: 'Sillón' },
  { id: 'profesional', label: 'Profesional que administró' },
  { id: 'ges', label: 'Código GES' },
];

const ESTADO_RECETA_STYLES = {
  borrador: 'bg-slate-100 text-slate-700',
  validada: 'bg-emerald-100 text-emerald-700',
  rechazada: 'bg-red-100 text-red-700',
  anulada: 'bg-slate-200 text-slate-600',
};

const ESTADO_CICLO_STYLES = {
  programado: 'bg-slate-100 text-slate-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  listo_para_administrar: 'bg-indigo-100 text-indigo-700',
  en_administracion: 'bg-blue-100 text-blue-700',
  administrado: 'bg-emerald-100 text-emerald-700',
  suspendido: 'bg-orange-100 text-orange-700',
  cancelado: 'bg-red-100 text-red-700',
};

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-slate-800 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function DesgloseBadges({ items, estilos, vacioTexto }) {
  if (!items?.length) return <div className="text-xs text-slate-400">{vacioTexto}</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span key={it.estado ?? it.clave} className={`text-xs font-medium px-2 py-1 rounded-full ${estilos[it.estado] ?? 'bg-slate-100 text-slate-700'}`}>
          {it.estadoLabel ?? it.clave}: {it.cantidad}
        </span>
      ))}
    </div>
  );
}

export default function EstadisticasQuimio() {
  const [desde, setDesde] = useState(haceDiasISO(30));
  const [hasta, setHasta] = useState(haceDiasISO(0));
  const [groupBy, setGroupBy] = useState('protocolo');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await fetchEstadisticasQuimio({ desde, hasta, groupBy });
      setResultado(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las estadísticas.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, groupBy]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleExportar() {
    setExportando(true);
    try {
      await descargarEstadisticasQuimio({ desde, hasta });
    } catch (err) {
      setError(err.message || 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Estadísticas de quimioterapia</h2>

      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-[11px] text-slate-400">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400">Agrupar por</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            {GROUP_BY_OPCIONES.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleExportar}
          disabled={exportando}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-md px-3 py-1.5 ml-auto self-end"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {cargando && <div className="text-sm text-slate-400">Cargando…</div>}

      {!cargando && resultado && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Pacientes en tratamiento" value={resultado.pacientesEnTratamiento} sub="con receta validada" />
            <KpiCard label="Ciclos administrados" value={resultado.total} sub="en el período elegido" />
            <KpiCard
              label="Con reacción adversa"
              value={`${resultado.reaccionesAdversas?.porcentaje ?? 0}%`}
              sub={`${resultado.reaccionesAdversas?.conReaccion ?? 0} de ${resultado.reaccionesAdversas?.total ?? 0} ciclos`}
            />
            <KpiCard
              label="Fármacos DAC administrados"
              value={resultado.porClasificacionFarmaco?.find((c) => c.clave === 'DAC')?.cantidad ?? 0}
              sub={`vs. ${resultado.porClasificacionFarmaco?.find((c) => c.clave === 'LRS')?.cantidad ?? 0} LRS — en el período`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Recetas por estado</h3>
              <div className="text-[11px] text-slate-400 mb-2">Total actual de la plataforma, no filtrado por fecha</div>
              <DesgloseBadges items={resultado.porEstadoReceta} estilos={ESTADO_RECETA_STYLES} vacioTexto="Sin recetas." />
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Ciclos por estado</h3>
              <div className="text-[11px] text-slate-400 mb-2">Total actual de la plataforma, no filtrado por fecha</div>
              <DesgloseBadges items={resultado.porEstadoCiclo} estilos={ESTADO_CICLO_STYLES} vacioTexto="Sin ciclos agendados." />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Fármacos de quimioterapia administrados por clasificación</h3>
            <div className="text-[11px] text-slate-400 mb-2">Líneas de fármaco de cada ciclo administrado en el período (un ciclo puede tener más de una)</div>
            <DesgloseBadges
              items={resultado.porClasificacionFarmaco?.map((c) => ({ clave: `${c.clave}`, cantidad: c.cantidad }))}
              estilos={{}}
              vacioTexto="Sin administraciones en el período."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{resultado.total}</span> ciclos administrados en el período, agrupados por {GROUP_BY_OPCIONES.find((g) => g.id === resultado.groupBy)?.label.toLowerCase()}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{GROUP_BY_OPCIONES.find((g) => g.id === resultado.groupBy)?.label}</th>
                  <th className="text-left px-4 py-2">Ciclos administrados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!resultado.detalle.length && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">Sin datos en el período.</td></tr>
                )}
                {resultado.detalle.map((d) => (
                  <tr key={d.clave}>
                    <td className="px-4 py-2 text-slate-700">{d.clave}</td>
                    <td className="px-4 py-2 text-slate-600">{d.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
