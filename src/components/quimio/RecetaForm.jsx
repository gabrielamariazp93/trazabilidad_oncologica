import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { buscarPacientes, crearPaciente, crearReceta } from '../../lib/api.js';

const FARMACO_VACIO = { farmaco: '', dosis: '', unidad: 'mg/m2', via: 'EV', duracionInfusionMin: '' };

export default function RecetaForm({ onClose, onCreada }) {
  const [rutBusqueda, setRutBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [nuevoPaciente, setNuevoPaciente] = useState({ rut: '', nombre: '' });
  const [protocolo, setProtocolo] = useState('');
  const [indicacion, setIndicacion] = useState('');
  const [numeroCiclosTotal, setNumeroCiclosTotal] = useState(4);
  const [intervaloDias, setIntervaloDias] = useState(21);
  const [superficieCorporal, setSuperficieCorporal] = useState('');
  const [farmacos, setFarmacos] = useState([{ ...FARMACO_VACIO }]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!rutBusqueda.trim()) {
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
  }, [rutBusqueda]);

  function actualizarFarmaco(idx, campo, valor) {
    setFarmacos((lista) => lista.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  }

  function agregarFarmaco() {
    setFarmacos((lista) => [...lista, { ...FARMACO_VACIO }]);
  }

  function quitarFarmaco(idx) {
    setFarmacos((lista) => lista.filter((_, i) => i !== idx));
  }

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
      const farmacosValidos = farmacos.filter((f) => f.farmaco.trim());
      if (!farmacosValidos.length) throw new Error('Agrega al menos un fármaco.');

      const data = await crearReceta({
        pacienteId: paciente.id,
        protocolo: protocolo.trim(),
        indicacion: indicacion.trim() || null,
        numeroCiclosTotal: Number(numeroCiclosTotal),
        intervaloDias: Number(intervaloDias),
        superficieCorporal: superficieCorporal ? Number(superficieCorporal) : null,
        farmacos: farmacosValidos.map((f) => ({ ...f, duracionInfusionMin: f.duracionInfusionMin || null })),
      });
      onCreada(data.receta);
    } catch (err) {
      setError(err.message || 'No se pudo crear la receta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-20 px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Nueva receta de quimioterapia</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Protocolo / esquema</label>
              <input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="Ej. AC-T, FOLFOX-6" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Indicación</label>
              <input value={indicacion} onChange={(e) => setIndicacion(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
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
              <label className="block text-xs font-medium text-slate-500 mb-1">Superficie corporal (m²)</label>
              <input type="number" step="0.01" value={superficieCorporal} onChange={(e) => setSuperficieCorporal(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">Fármacos</label>
              <button type="button" onClick={agregarFarmaco} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> Agregar fármaco
              </button>
            </div>
            <div className="space-y-2">
              {farmacos.map((f, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                  <input value={f.farmaco} onChange={(e) => actualizarFarmaco(idx, 'farmaco', e.target.value)} placeholder="Fármaco" className="col-span-4 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <input value={f.dosis} onChange={(e) => actualizarFarmaco(idx, 'dosis', e.target.value)} placeholder="Dosis" className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <input value={f.unidad} onChange={(e) => actualizarFarmaco(idx, 'unidad', e.target.value)} placeholder="Unidad" className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <input value={f.via} onChange={(e) => actualizarFarmaco(idx, 'via', e.target.value)} placeholder="Vía" className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <input type="number" value={f.duracionInfusionMin} onChange={(e) => actualizarFarmaco(idx, 'duracionInfusionMin', e.target.value)} placeholder="Min." className="col-span-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                  <button type="button" onClick={() => quitarFarmaco(idx)} className="col-span-1 text-slate-400 hover:text-red-500 flex justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
