import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, CalendarPlus } from 'lucide-react';
import { buscarPacientes, fetchRecetas, crearCiclo } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import SelectorDisponibilidad from './SelectorDisponibilidad.jsx';

const CICLO_ESTADO_STYLES = {
  programado: 'bg-slate-100 text-slate-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  listo_para_administrar: 'bg-indigo-100 text-indigo-700',
  en_administracion: 'bg-blue-100 text-blue-700',
  administrado: 'bg-emerald-100 text-emerald-700',
  suspendido: 'bg-orange-100 text-orange-700',
  cancelado: 'bg-red-100 text-red-700',
};

function duracionSugerida(receta) {
  const minutosQuimio = (receta?.farmacos ?? [])
    .filter((f) => f.categoria === 'quimioterapia' && f.duracionInfusionMin)
    .reduce((sum, f) => sum + f.duracionInfusionMin, 0);
  return minutosQuimio > 0 ? minutosQuimio + 30 : 180; // +30 min de margen de premedicación/observación
}

export default function TableroPaciente({ bootstrap, pacienteInicial, onConsumido }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [paciente, setPaciente] = useState(pacienteInicial ?? null);
  const [recetas, setRecetas] = useState([]);
  const [recetaId, setRecetaId] = useState('');
  const [cargandoRecetas, setCargandoRecetas] = useState(false);

  const [seleccion, setSeleccion] = useState(null);
  const [numeroCiclo, setNumeroCiclo] = useState(1);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(null);

  useEffect(() => {
    if (pacienteInicial) {
      setPaciente(pacienteInicial);
      onConsumido?.();
    }
  }, [pacienteInicial, onConsumido]);

  useEffect(() => {
    if (!busqueda.trim() || paciente) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await buscarPacientes(busqueda.trim());
        setResultados(data.pacientes);
      } catch {
        setResultados([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, paciente]);

  const cargarRecetas = useCallback(async () => {
    if (!paciente) return;
    setCargandoRecetas(true);
    try {
      const data = await fetchRecetas({ pacienteId: paciente.id, estado: 'validada' });
      setRecetas(data.recetas);
      if (data.recetas.length === 1) setRecetaId(data.recetas[0].id);
    } finally {
      setCargandoRecetas(false);
    }
  }, [paciente]);

  useEffect(() => {
    cargarRecetas();
  }, [cargarRecetas]);

  const receta = recetas.find((r) => r.id === recetaId) ?? null;

  useEffect(() => {
    if (receta) setNumeroCiclo((receta.ciclos?.length ?? 0) + 1);
  }, [receta]);

  const minutosNecesarios = useMemo(() => duracionSugerida(receta), [receta]);

  // Si cambia la receta (y por lo tanto la duración necesaria), la selección de sillón+hora
  // anterior deja de ser válida — se limpia para forzar a elegir de nuevo.
  useEffect(() => {
    setSeleccion(null);
  }, [recetaId, minutosNecesarios]);

  async function handleAgendar(event) {
    event.preventDefault();
    setError(null);
    setExito(null);
    if (!receta) {
      setError('Selecciona una receta validada.');
      return;
    }
    if (!seleccion) {
      setError('Elige un sillón y horario con cupo disponible.');
      return;
    }
    setGuardando(true);
    try {
      await crearCiclo({
        recetaId: receta.id,
        numeroCiclo: Number(numeroCiclo),
        fechaProgramada: seleccion.fecha,
        horaInicio: seleccion.horaInicio,
        sillonId: seleccion.sillonId,
        duracionEstimadaMin: minutosNecesarios,
      });
      setExito(`Sesión agendada: ciclo ${numeroCiclo}, ${seleccion.fecha} ${seleccion.horaInicio}.`);
      setSeleccion(null);
      await cargarRecetas();
    } catch (err) {
      setError(err.message || 'No se pudo agendar la sesión.');
    } finally {
      setGuardando(false);
    }
  }

  if (!paciente) {
    return (
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Tablero de quimioterapia</h2>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar paciente por RUT o nombre"
            className="w-full border border-slate-300 rounded-md pl-8 pr-3 py-2 text-sm"
          />
        </div>
        {resultados.length > 0 && (
          <div className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100">
            {resultados.map((p) => (
              <button key={p.id} type="button" onClick={() => setPaciente(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                {p.nombre} — {p.rut}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{paciente.nombre}</h2>
          <div className="text-sm text-slate-500">RUT {paciente.rut}</div>
        </div>
        <button type="button" onClick={() => { setPaciente(null); setRecetaId(''); setRecetas([]); }} className="text-sm text-slate-500 hover:text-slate-800">
          Cambiar paciente
        </button>
      </div>

      {cargandoRecetas && <div className="text-sm text-slate-400">Cargando recetas…</div>}

      {!cargandoRecetas && !recetas.length && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 text-sm text-slate-500">
          Este paciente no tiene recetas de quimioterapia validadas todavía. Pide al médico oncólogo que elabore la receta y a la enfermera de oncología que la valide — recién ahí aparece acá para agendar sesiones.
        </div>
      )}

      {!!recetas.length && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          <div className="space-y-5">
            {recetas.length > 1 && (
              <select value={recetaId} onChange={(e) => setRecetaId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                {recetas.map((r) => (
                  <option key={r.id} value={r.id}>{r.protocolo} — {r.ciclos?.length ?? 0}/{r.numeroCiclosTotal} ciclos</option>
                ))}
              </select>
            )}

            {receta && (
              <section className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">{receta.protocolo}</h3>
                <div className="text-xs text-slate-500 mb-3">
                  {receta.numeroCiclosTotal} ciclos · cada {receta.intervaloDias} días
                  {receta.superficieCorporal ? ` · SC ${receta.superficieCorporal} m²` : ''}
                  {receta.riesgoEmeticoLabel ? ` · Riesgo emético ${receta.riesgoEmeticoLabel.toLowerCase()}` : ''}
                </div>
                {['premedicacion', 'quimioterapia', 'rescate'].map((cat) => {
                  const items = receta.farmacos?.filter((f) => f.categoria === cat) ?? [];
                  if (!items.length) return null;
                  return (
                    <div key={cat} className="mb-2 last:mb-0">
                      <div className="text-[11px] font-medium text-slate-400 uppercase">{items[0].categoriaLabel}</div>
                      {items.map((f) => (
                        <div key={f.id} className="text-sm text-slate-600">
                          {f.farmaco} {f.dosis} {f.unidad} · {f.via}{f.frecuencia ? ` · ${f.frecuencia}` : ''}{f.nSesion ? ` · ${f.nSesion}` : ''}{f.clasificacion ? ` · ${f.clasificacion}` : ''}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {receta.neupogenIndicado && <div className="text-xs text-amber-600 mt-2">Neupogen indicado{receta.neupogenDias ? ` · ${receta.neupogenDias}` : ''}</div>}

                <div className="border-t border-slate-100 mt-3 pt-3">
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Sesiones</div>
                  {!receta.ciclos?.length && <div className="text-sm text-slate-400">Sin sesiones agendadas todavía.</div>}
                  <div className="space-y-1.5">
                    {receta.ciclos?.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Ciclo {c.numeroCiclo} — {formatFecha(c.fechaProgramada)} {c.horaInicio}–{c.horaTermino}{c.sillon ? ` · ${c.sillon.nombre}` : ''}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${CICLO_ESTADO_STYLES[c.estado] ?? 'bg-slate-100 text-slate-700'}`}>{c.estadoLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-5 min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <CalendarPlus className="w-4 h-4" /> Registrar sesión
            </h3>
            {!receta ? (
              <div className="text-sm text-slate-400">Selecciona una receta para agendar una sesión.</div>
            ) : (
              <form onSubmit={handleAgendar} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">N° de ciclo</label>
                    <input type="number" min="1" value={numeroCiclo} onChange={(e) => setNumeroCiclo(e.target.value)} className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
                  </div>
                  <div className="text-xs text-slate-400">Duración estimada: {minutosNecesarios} min</div>
                </div>

                <SelectorDisponibilidad duracionMin={minutosNecesarios} value={seleccion} onChange={setSeleccion} />

                {error && <div className="text-sm text-red-600">{error}</div>}
                {exito && <div className="text-sm text-emerald-600">{exito}</div>}

                <button
                  type="submit"
                  disabled={guardando || !seleccion}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-3 py-2"
                >
                  Agendar sesión
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
