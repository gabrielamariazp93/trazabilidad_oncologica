import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Trash2, FlaskConical } from 'lucide-react';
import { buscarPacientes, crearPaciente, crearReceta, fetchEsquemasQuimio, fetchEsquemaQuimio, fetchCodigosGes, fetchCodigosPpv, fetchClasificacionReferencia } from '../../lib/api.js';
import { calcularSC } from '../../lib/ui.js';

function farmacoVacio(categoria) {
  return { categoria, farmaco: '', dosis: '', unidad: categoria === 'quimioterapia' ? 'mg/m2' : 'mg', via: 'EV', frecuencia: '', clasificacion: '', duracionInfusionMin: '' };
}

function quitarTildes(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normNombre(s) {
  return quitarTildes(s).toUpperCase().trim().replace(/\s+/g, ' ');
}

// "FOLFOX (5 FLUOROURACILO...) (CICLO)" -> "FOLFOX" — mismo criterio que
// prisma/data/_analizar_relacion_esquema_ppv.js, para comparar contra el nombre de un fármaco.
function baseCodigoPpv(familia) {
  let n = normNombre(familia);
  const idx = n.indexOf('(');
  if (idx > 0) n = n.slice(0, idx).trim();
  return n.replace(/\*+$/, '').trim();
}

export default function RecetaForm({ bootstrap, pacienteInicial, onClose, onCreada }) {
  const [rutBusqueda, setRutBusqueda] = useState(pacienteInicial ? `${pacienteInicial.nombre} (${pacienteInicial.rut})` : '');
  const [resultados, setResultados] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(pacienteInicial ?? null);
  const [nuevoPaciente, setNuevoPaciente] = useState({ rut: '', nombre: '' });

  const [esquemaId, setEsquemaId] = useState(null);
  const [esquemaNombre, setEsquemaNombre] = useState('');
  const [esquemas, setEsquemas] = useState([]);
  // Nombres de las drogas que trajo el esquema elegido (para no proponer de nuevo un código PPV
  // individual de una droga que ya está cubierta por el código del esquema completo) y el código
  // PPV del esquema mismo, si tiene uno vinculado.
  const [esquemaDrogasBase, setEsquemaDrogasBase] = useState([]);
  const [esquemaCodigoPpvId, setEsquemaCodigoPpvId] = useState(null);
  const [protocolo, setProtocolo] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [estadio, setEstadio] = useState('');
  // Código(s) GES: elección manual, pueden ser varios (una receta puede tributar más de una
  // línea de producción/REM).
  const [codigoGesIds, setCodigoGesIds] = useState([]);
  const [codigosGes, setCodigosGes] = useState([]);
  const [codigosPpv, setCodigosPpv] = useState([]);
  const [clasifReferencia, setClasifReferencia] = useState({ dac: [], lrs: [] });
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
    fetchEsquemasQuimio().then((data) => setEsquemas(data.esquemas)).catch(() => {});
    fetchCodigosGes().then((data) => setCodigosGes(data.codigosGes)).catch(() => {});
    fetchCodigosPpv().then((data) => setCodigosPpv(data.codigosPpv)).catch(() => {});
    fetchClasificacionReferencia().then(setClasifReferencia).catch(() => {});
  }, []);

  // Sugiere LRS/DAC según el nombre del fármaco de quimioterapia, comparando contra las listas
  // reales importadas de la planilla (sin forzar — el usuario siempre puede cambiarlo a mano).
  function sugerirClasificacion(nombreFarmaco) {
    if (!nombreFarmaco) return '';
    const n = nombreFarmaco.trim().toLowerCase();
    if (clasifReferencia.dac?.some((d) => n.includes(d.toLowerCase()) || d.toLowerCase().includes(n))) return 'DAC';
    if (clasifReferencia.lrs?.some((d) => n.includes(d.toLowerCase()) || d.toLowerCase().includes(n))) return 'LRS';
    return '';
  }

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

  async function seleccionarEsquema(esquemaBasico) {
    setEsquemaId(esquemaBasico.id);
    setEsquemaNombre(esquemaBasico.nombre);
    setProtocolo(esquemaBasico.nombre);
    // El código PPV del esquema (si tiene uno vinculado) cuenta como su propia línea — las
    // drogas que trae el esquema no vuelven a buscarse individualmente para no duplicar esa
    // línea (ver derivedCodigosPpv más abajo).
    setEsquemaCodigoPpvId(esquemaBasico.codigoPpvId ?? null);

    const { esquema } = await fetchEsquemaQuimio(esquemaBasico.id);
    if (!esquema.lineas?.length) { setEsquemaDrogasBase([]); return; }

    setEsquemaDrogasBase(esquema.lineas.map((l) => l.droga));

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
    setEsquemaDrogasBase([]);
    setEsquemaCodigoPpvId(null);
  }

  // Códigos PPV no GES derivados de lo que hay en Quimioterapia en este momento: el código del
  // esquema (si corresponde) cuenta como una línea, y cada fármaco agregado que NO sea parte de
  // las drogas base del esquema se busca individualmente contra el catálogo — si agrega otro
  // fármaco con coincidencia, se suma una línea más. Solo coincidencias exactas y sin ambigüedad
  // (mismo criterio que la relación esquema-PPV), para no arriesgar un código incorrecto.
  const codigosPpvDerivados = useMemo(() => {
    const resultado = [];
    const vistos = new Set();
    if (esquemaCodigoPpvId) {
      const c = codigosPpv.find((x) => x.id === esquemaCodigoPpvId);
      if (c) { resultado.push(c); vistos.add(c.id); }
    }
    const baseEsquemaSet = new Set(esquemaDrogasBase.map(normNombre));
    const yaBuscados = new Set();
    quimioterapia.forEach((f) => {
      const nombre = f.farmaco?.trim();
      if (!nombre) return;
      const norm = normNombre(nombre);
      if (baseEsquemaSet.has(norm) || yaBuscados.has(norm)) return;
      yaBuscados.add(norm);
      const candidatos = codigosPpv.filter((c) => baseCodigoPpv(c.familia || c.glosaTrazadora) === norm);
      if (candidatos.length === 1 && !vistos.has(candidatos[0].id)) {
        resultado.push(candidatos[0]);
        vistos.add(candidatos[0].id);
      }
    });
    return resultado;
  }, [esquemaCodigoPpvId, esquemaDrogasBase, quimioterapia, codigosPpv]);

  function makeSetters(lista, setLista, categoria) {
    return {
      lista,
      actualizar: (idx, campo, valor) => setLista((l) => l.map((f, i) => {
        if (i !== idx) return f;
        const actualizada = { ...f, [campo]: valor };
        // Sugiere LRS/DAC al escribir el nombre, solo si todavía no se eligió una clasificación
        // a mano — nunca pisa una elección manual existente.
        if (campo === 'farmaco' && categoria === 'quimioterapia' && !f.clasificacion) {
          const sugerida = sugerirClasificacion(valor);
          if (sugerida) actualizada.clasificacion = sugerida;
        }
        return actualizada;
      })),
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
        codigoGesIds,
        codigoPpvIds: codigosPpvDerivados.map((c) => c.id),
        protocolo: protocolo.trim(),
        diagnostico: diagnostico.trim() || null,
        estadio: estadio || null,
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
              <FlaskConical className="w-3.5 h-3.5" /> Esquema del catálogo
            </label>
            <select
              value={esquemaId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) { quitarEsquema(); return; }
                const elegido = esquemas.find((es) => es.id === id);
                if (elegido) seleccionarEsquema(elegido);
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Sin esquema (protocolo libre)</option>
              {esquemas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
            {esquemaId && (
              <div className="text-xs text-emerald-600 mt-1">
                Esquema "{esquemaNombre}" cargado — fármacos y ciclos precargados abajo, puedes seguir editando.
              </div>
            )}
            {!esquemaId && (
              <div className="text-xs text-slate-400 mt-1">Opcional — si el protocolo no está en el catálogo, complétalo manualmente abajo.</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Códigos GES (opcional, pueden ser varios)</label>
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setCodigoGesIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">+ Agregar código GES…</option>
              {codigosGes.filter((c) => !codigoGesIds.includes(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.familia}</option>
              ))}
            </select>
            {!codigosGes.length && <div className="text-xs text-slate-400 mt-1">Catálogo vacío por ahora.</div>}
            {codigoGesIds.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {codigoGesIds.map((id) => {
                  const c = codigosGes.find((x) => x.id === id);
                  return (
                    <span key={id} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs rounded-full px-2 py-1">
                      {c ? `${c.codigo} — ${c.familia}` : id}
                      <button type="button" onClick={() => setCodigoGesIds((ids) => ids.filter((x) => x !== id))} className="text-indigo-400 hover:text-indigo-700">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
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
              <label className="block text-xs font-medium text-slate-500 mb-1">Estadío</label>
              <select value={estadio} onChange={(e) => setEstadio(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
                <option value="">Sin especificar</option>
                {bootstrap.quimio.estadios.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
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

            <div className="bg-slate-50 rounded-md px-3 py-2">
              <div className="text-xs font-medium text-slate-500">Códigos PPV no GES (REM) — según los fármacos agregados arriba</div>
              {!codigosPpvDerivados.length && (
                <div className="text-xs text-slate-400 mt-1">Ninguno todavía. Se agregan solos a medida que el esquema o los fármacos de Quimioterapia coinciden con el catálogo.</div>
              )}
              {codigosPpvDerivados.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {codigosPpvDerivados.map((c) => (
                    <span key={c.id} className="bg-white border border-slate-200 text-slate-700 text-xs rounded-full px-2 py-1">
                      {c.codigo} — {c.glosaTrazadora}
                    </span>
                  ))}
                </div>
              )}
            </div>

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
