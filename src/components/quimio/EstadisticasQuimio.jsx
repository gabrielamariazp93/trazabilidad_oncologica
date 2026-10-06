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
];

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
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Estadísticas de quimioterapia administrada</h2>

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
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{resultado.total}</span> ciclos administrados en el período
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
      )}
    </div>
  );
}
