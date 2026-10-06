import React, { useEffect, useState, useCallback } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchGrillaQuimio } from '../../lib/api.js';
import AgendarCicloForm from './AgendarCicloForm.jsx';

const DIAS_LABEL = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };

function inicioSemana(date) {
  const d = new Date(date);
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

const AGENDA_ROLES = ['enfermera_quimio', 'admin'];

export default function SillonesGrilla({ user, bootstrap }) {
  const [semanaBase, setSemanaBase] = useState(() => inicioSemana(new Date()));
  const [grilla, setGrilla] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fechaPreseleccionada, setFechaPreseleccionada] = useState(null);

  const hasta = new Date(semanaBase.getTime() + 6 * 86400000);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await fetchGrillaQuimio(toISODate(semanaBase), toISODate(hasta));
      setGrilla(data);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la grilla.');
    } finally {
      setCargando(false);
    }
  }, [semanaBase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeAgendar = AGENDA_ROLES.includes(user.role);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSemanaBase((d) => new Date(d.getTime() - 7 * 86400000))} className="border border-slate-200 rounded-md p-1.5 text-slate-500 hover:bg-slate-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-medium text-slate-700">
            {toISODate(semanaBase)} — {toISODate(hasta)}
          </div>
          <button type="button" onClick={() => setSemanaBase((d) => new Date(d.getTime() + 7 * 86400000))} className="border border-slate-200 rounded-md p-1.5 text-slate-500 hover:bg-slate-50">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setSemanaBase(inicioSemana(new Date()))} className="text-xs text-blue-600 hover:text-blue-700 ml-1">
            Hoy
          </button>
        </div>
        {puedeAgendar && (
          <button type="button" onClick={() => { setFechaPreseleccionada(null); setMostrarForm(true); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-3 py-2">
            <Plus className="w-4 h-4" /> Agendar ciclo
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {cargando && <div className="text-sm text-slate-400">Cargando grilla…</div>}

      {!cargando && grilla && (
        <div className="space-y-6">
          {grilla.turnos.map((turno) => (
            <div key={turno} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{turno}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase">
                      <th className="text-left px-3 py-2 w-28">Sillón</th>
                      {grilla.dias.map((dia) => (
                        <th key={dia} className="text-left px-3 py-2 min-w-[140px]">
                          {DIAS_LABEL[new Date(dia).getDay()]} {dia.slice(8, 10)}/{dia.slice(5, 7)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {grilla.sillones.map((sillon) => (
                      <tr key={sillon.id}>
                        <td className="px-3 py-2 font-medium text-slate-700 align-top">{sillon.nombre}</td>
                        {grilla.dias.map((dia) => {
                          const celda = grilla.celdas[dia]?.[turno]?.[sillon.id];
                          return (
                            <td key={dia} className="px-3 py-2 align-top">
                              {celda?.ciclos.length ? (
                                <div className="space-y-1">
                                  {celda.ciclos.map((c) => (
                                    <div key={c.id} className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-1">
                                      {c.receta.paciente.nombre} · ciclo {c.numeroCiclo}
                                      <div className="text-[10px] text-blue-500">{c.estadoLabel}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarForm && (
        <AgendarCicloForm
          bootstrap={bootstrap}
          fechaInicial={fechaPreseleccionada}
          onClose={() => setMostrarForm(false)}
          onCreado={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
