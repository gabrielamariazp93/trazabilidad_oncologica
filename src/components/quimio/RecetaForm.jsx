import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Trash2, FlaskConical } from 'lucide-react';
import { buscarPacientes, crearPaciente, crearReceta, fetchEsquemasQuimio, fetchEsquemaQuimio } from '../../lib/api.js';
import { calcularSC } from '../../lib/ui.js';

function farmacoVacio(categoria) {
  return { categoria, farmaco: '', dosis: '', unidad: categoria === 'quimioterapia' ? 'mg/m2' : 'mg', via: 'EV', frecuencia: '', clasificacion: '', duracionInfusionMin: '' };
}

export default function RecetaForm({ bootstrap, pacienteInicial, onClose, onCreada }) {
  const [rutBusqueda, setRutBusqueda] = useState(pacienteInicial ? `${pacienteInicial.nombre} (${pacienteInicial.rut})` : '');
  const [resultados, setResultados] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacienteInicial ?? null);
  const [nuevoPaciente, setNuevoPaciente] = useState({ rut: '', nombre: '' });

  const [esquemaId, setEsquemaId] = useState(null);
  const [esquemaNombre, setEsquemaNombre] = useState('');
  const [busquedaEsquema, setBusquedaEsquema] = useState('');
  const [resultadosEsquema, setResultadosEsquema] = useState([]);
  const [protocolo, setProtocolo] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [indicacion, setIndicacion] = useState('');
  const [intencion, setIntencion] = useState('');
  const [riesgoEmetico, setRiesgoEmetico] = useState('');
  const [numeroCiclosTotal, setNumeroCiclosTotal] = useState(4);
  const [intervaloDias, setIntervaloDias] = useState(21);
  const [pesoKg, setPesoKg] = useState('');
  const [tallaCm, setTallaCm] = useState('');
  const [superficieCorporal, setSuperficieCorporal] = useState('');
  const [otrasIndicaciones, setOtrasIndicaciones] = useState('');
  const [neupogenIndicado, setNeupogenIndicado] = useState(false);
  const [neupogenDias, setNeupogenDias] = useState('');

  const [premedicacion, setPremedicacion] = useState([farmacoVacio('premedicacion')]);
  const [quimioterapia, setQuimioterapia] = useState([farmacoVacio('quimioterapia')]);
  const [rescate, setRescate] = useState([farmacoVacio('rescate')]);

  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const debounceRef = useRef(null);

  const scCalculada = useMemo(() => calcularSC(pesoKg, tallaCm), [pesoKg, tallaCm]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!rutBusqueda.trim() || pacienteSeleccionado) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await buscarPacientes(rutBusqueda.trim());
        setResultados(data.pacientes);
      } catch {
        setResultados([]);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [rutBusqueda, pacienteSeleccionado]);

  const debounceEsquemaRef = useRef(null);
  useEffect(() => {
    if (debounceEsquemaRef.current) clearTimeout(debounceEsquemaRef.current);
    if (!busquedaEsquema.trim() || esquemaId) {
      setResultadosEsquema([]);
      return;
    }
    debounceEsquemaRef.current = setTimeout(async () => {
      try {
        const data = await fetchEsquemasQuimio(busquedaEsquema.trim());
        setResultadosEsquema(data.esquemas);
      } catch {
        setResultadosEsquema([]);
      }
    }, 250);
    return () => clearTimeout(debounceEsquemaRef.current);
  }, [busquedaEsquema, esquemaId]);

  async function seleccionarEsquema(esquemaBasico) {
    setEsquemaId(esquemaBasico.id);
    setEsquemaNombre(esquemaBasico.nombre);
    setBusquedaEsquema(esquemaBasico.nombre);
    setResultadosEsquema([]);
    setProtocolo(esquemaBasico.nombre);

    const { esquema } = await fetchEsquemaQuimio(esquemaBasico.id);
    if (!esquema.lineas?.length) return;

    const primeraNumerica = esquema.lineas.find((l) => /^\d+$/.test(String(l.nCicloCalculado)));
    if (primeraNumerica) setNumeroCiclosTotal(Number(primeraNumerica.nCicloCalculado));
    setIntervaloDias(esquema.lineas[0].freqEntreCiclos || 21);

    setQuimioterapia(
      esquema.lineas.map((l) => ({
        categoria: 'quimioterapia',
        farmaco: l.droga,
        dosis: '',
        unidad: 'mg/m2',
        via: 'EV',
        frecuencia: '',
        nSesion: l.nSesion,
        clasificacion: '',
        duracionInfusionMin: l.horasSillon ? Math.round(l.horasSillon * 60) : '',
      }))
    );
  }

  function quitarEsquema() {
    setEsquemaId(null);
    setEsquemaNombre('');
    setBusquedaEsquema('');
  }

  function makeSetters(lista, setLista, categoria) {
    return {
      lista,
      actualizar: (idx, campo, valor) => setLista((l) => l.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f))),
      agregar: () => setLista((l) => [...l, farmacoVacio(categoria)]),
      quitar: (idx) => setLista((l) => l.filter((_, i) => i !== idx)),
    };
  }

  const seccionPremedicacion = makeSetters(premedicacion, setPremedicacion, 'premedicacion');
  const seccionQuimioterapia = makeSetters(quimioterapia, setQuimioterapia, 'quimioterapia');
  const seccionRescate = makeSetters(rescate, setRescate, 'rescate');

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      let paciente = pacienteSeleccionado;
      if (!paciente) {
        if (!nuevoPaciente.rut || !nuevoPaciente.nombre) {
          throw new Error('Busca un paciente existente o completa RUT y nombre para crear uno nuevo.');
        }
        const data = await crearPaciente(nuevoPaciente);
        paciente = data.paciente;
      }
      if (!protocolo.trim()) throw new Error('Indica el protocolo/esquema.');

      const farmacos = [...premedicacion, ...quimioterapia, ...rescate]
        .filter((f) => f.farmaco.trim())
        .map((f, idx) => ({ ...f, duracionInfusionMin: f.duracionInfusionMin || null, orden: idx }));
      if (!farmacos.some((f) => f.categoria === 'quimioterapia')) {
        throw new Error('Agrega al menos un fármaco en la sección Quimioterapia.');
      }

      const data = await crearReceta({
        pacienteId: paciente.id,
        esquemaId,
        protocolo: protocolo.trim(),
        diagnostico: diagnostico.trim() || null,
        indicacion: indicacion.trim() || null,
        intencion: intencion || null,
        riesgoEmetico: riesgoEmetico || null,
        numeroCiclosTotal: Number(numeroCiclosTotal),
        intervaloDias: Number(intervaloDias),
        pesoKg: pesoKg ? Number(pesoKg) : null,
        tallaCm: tallaCm ? Number(tallaCm) : null,
        superficieCorporal: superficieCorporal ? Number(superficieCorporal) : scCalculada,
        otrasIndicaciones: otrasIndicaciones.trim() || null,
        neupogenIndicado,
        neupogenDias: neupogenIndicado ? (neupogenDias.trim() || null) : null,
        farmacos,
      });
      onCreada(data.receta);
    } catch (err) {
      setError(err.message || 'No se pudo crear la receta.');
    } finally {
      setGuardando(false);
    }
  }

  function FilaFarmaco({ f, idx, onChange, onQuitar, placeholderUnidad }) {
    return (
      <div className="grid grid-cols-12 gap-1.5 items-center">
        <input value={f.farmaco} onChange={(e) => onChange(idx, 'farmaco', e.target.value)} placeholder="Fármaco" className="col-span-3 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        <input value={f.dosis} onChange={(e) => onChange(idx, 'dosis', e.target.value)} placeholder="Dosis" className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        <input value={f.unidad} onChange={(e) => onChange(idx, 'unidad', e.target.value)} placeholder={placeholderUnidad} className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        <select value={f.via} onChange={(e) => onChange(idx, 'via', e.target.value)} className="col-span-1 border border-slate-300 rounded-md px-1 py-1.5 text-sm">
          <option value="EV">EV</option>
          <option value="VO">VO</option>
        </select>
        <input value={f.frecuencia} onChange={(e) => onChange(idx, 'frecuencia', e.target.value)} placeholder="Frecuencia / condición" className="col-span-3 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        <button type="button" onClick={() => onQuitar(idx)} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  function Seccion({ titulo, ayuda, seccion, mostrarDuracion }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <label className="text-xs font-medium text-slate-700">{titulo}</label>
            {ayuda && <span className="text-[11px] text-slate-400 ml-1.5">{ayuda}</span>}
          </div>
          <button type="button" onClick={seccion.agregar} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        </div>
        <div className="space-y-1.5">
          {seccion.lista.map((f, idx) => (
            <div key={idx}>
              <FilaFarmaco f={f} idx={idx} onChange={seccion.actualizar} onQuitar={seccion.quitar} placeholderUnidad={mostrarDuracion ? 'mg/m2' : 'mg'} />
              {mostrarDuracion && (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    value={f.duracionInfusionMin}
                    onChange={(e) => seccion.actualizar(idx, 'duracionInfusionMin', e.target.value)}
                    placeholder="Duración infusión (min)"
                    className="w-44 border border-slate-300 rounded-md px-2 py-1 text-xs"
                  />
                  <select
                    value={f.clasificacion ?? ''}
                    onChange={(e) => seccion.actualizar(idx, 'clasificacion', e.target.value)}
                    className="border border-slate-300 rounded-md px-1.5 py-1 text-xs"
                    title="Clasificación de compra/financiamiento"
                  >
                    <option value="">LRS / DAC</option>
                    <option value="LRS">LRS</option>
                    <option value="DAC">DAC</option>
                  </select>
                  {f.nSesion && (
                    <span className="text-[11px] text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5" title="Día(s) del ciclo según el esquema">
                      {f.nSesion}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-20 px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Nueva receta de quimioterapia</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscar paciente por RUT o nombre</label>
            <input
              value={rutBusqueda}
              onChange={(e) => {
                setRutBusqueda(e.target.value);
                setPacienteSeleccionado(null);
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              placeholder="12345678-9 o nombre"
              disabled={!!pacienteInicial}
            />
            {resultados.length > 0 && !pacienteSeleccionado && (
              <div className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {resultados.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      setPacienteSeleccionado(p);
                      setRutBusqueda(`${p.nombre} (${p.rut})`);
                      setResultados([]);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    {p.nombre} — {p.rut}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!pacienteSeleccionado && (
            <div className="border border-dashed border-slate-300 rounded-md p-3 space-y-2">
              <div className="text-xs text-slate-500">¿No existe el paciente? Complétalo para crearlo:</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={nuevoPaciente.rut} onChange={(e) => setNuevoPaciente((v) => ({ ...v, rut: e.target.value }))} placeholder="RUT" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                <input value={nuevoPaciente.nombre} onChange={(e) => setNuevoPaciente((v) => ({ ...v, nombre: e.target.value }))} placeholder="Nombre completo" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <FlaskConical className="w-3.5 h-3.5" /> Buscar esquema del catálogo
            </label>
            <div className="relative">
              <input
                value={busquedaEsquema}
                onChange={(e) => {
                  setBusquedaEsquema(e.target.value);
                  if (esquemaId) quitarEsquema();
                }}
                placeholder="Ej. AC-21, FOLFOX 6, TAXOL-CRB…"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              {esquemaId && (
                <button type="button" onClick={quitarEsquema} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {resultadosEsquema.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {resultadosEsquema.map((e) => (
                  <button type="button" key={e.id} onClick={() => seleccionarEsquema(e)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                    {e.nombre}
                  </button>
                ))}
              </div>
            )}
            {esquemaId && (
              <div className="text-xs text-emerald-600 mt-1">
                Esquema "{esquemaNombre}" cargado — fármacos y ciclos precargados abajo, puedes seguir editando.
              </div>
            )}
            {!esquemaId && (
              <div className="text-xs text-slate-400 mt-1">Opcional — si el protocolo no está en el catálogo, complétalo manualmente abajo.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Protocolo / esquema</label>
              <input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="Ej. Docetaxel - Ciclofosfamida" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Diagnóstico</label>
              <input value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Indicación</label>
              <input value={indicacion} onChange={(e) => setIndicacion(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Intención</label>
              <select value={intencion} onChange={(e) => setIntencion(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                <option value="">Sin especificar</option>
                {bootstrap.quimio.intenciones.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Riesgo emético</label>
              <select value={riesgoEmetico} onChange={(e) => setRiesgoEmetico(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                <option value="">Sin especificar</option>
                {bootstrap.quimio.riesgosEmeticos.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">N° de ciclos</label>
              <input type="number" min="1" value={numeroCiclosTotal} onChange={(e) => setNumeroCiclosTotal(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Intervalo (días)</label>
              <input type="number" min="1" value={intervaloDias} onChange={(e) => setIntervaloDias(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Peso (kg)</label>
              <input type="number" step="0.1" value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Talla (cm)</label>
              <input type="number" value={tallaCm} onChange={(e) => setTallaCm(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Superficie corporal (m²) {scCalculada && !superficieCorporal ? `— calculada: ${scCalculada}` : ''}
              </label>
              <input
                type="number"
                step="0.01"
                value={superficieCorporal}
                onChange={(e) => setSuperficieCorporal(e.target.value)}
                placeholder={scCalculada ? String(scCalculada) : ''}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <Seccion titulo="Premedicación" ayuda="ej. Dexametasona 12 h antes" seccion={seccionPremedicacion} />
            <Seccion titulo="Quimioterapia" ayuda="drogas citotóxicas del esquema" seccion={seccionQuimioterapia} mostrarDuracion />
            <Seccion titulo="Rescate / PRN" ayuda="indicaciones si hay vómitos, diarrea, etc." seccion={seccionRescate} />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Otras indicaciones</label>
              <textarea value={otrasIndicaciones} onChange={(e) => setOtrasIndicaciones(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={neupogenIndicado} onChange={(e) => setNeupogenIndicado(e.target.checked)} />
              Neupogen indicado
            </label>
            {neupogenIndicado && (
              <input value={neupogenDias} onChange={(e) => setNeupogenDias(e.target.value)} placeholder="Días (ej. días 3 a 7 post ciclo)" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 px-3 py-2">Cancelar</button>
            <button type="submit" disabled={guardando} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2">
              Crear receta (borrador)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
