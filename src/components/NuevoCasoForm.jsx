import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { buscarPacientes, crearPaciente, createCaso } from '../lib/api.js';

export default function NuevoCasoForm({ onClose, onCreado }) {
  const [rutBusqueda, setRutBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [nuevoPaciente, setNuevoPaciente] = useState({ rut: '', nombre: '', sexo: '', telefono: '' });
  const [patologiaSospecha, setPatologiaSospecha] = useState('');
  const [origenIngreso, setOrigenIngreso] = useState('IC');
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
      if (!patologiaSospecha.trim()) {
        throw new Error('Indica la patología / sospecha.');
      }
      const data = await createCaso({
        pacienteId: paciente.id,
        patologiaSospecha: patologiaSospecha.trim(),
        origenIngreso,
      });
      onCreado(data.caso);
    } catch (err) {
      setError(err.message || 'No se pudo crear el caso.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-20 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Nuevo caso oncológico</h2>
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
                <input
                  value={nuevoPaciente.rut}
                  onChange={(e) => setNuevoPaciente((v) => ({ ...v, rut: e.target.value }))}
                  placeholder="RUT"
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  value={nuevoPaciente.nombre}
                  onChange={(e) => setNuevoPaciente((v) => ({ ...v, nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  value={nuevoPaciente.sexo}
                  onChange={(e) => setNuevoPaciente((v) => ({ ...v, sexo: e.target.value }))}
                  placeholder="Sexo"
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  value={nuevoPaciente.telefono}
                  onChange={(e) => setNuevoPaciente((v) => ({ ...v, telefono: e.target.value }))}
                  placeholder="Teléfono"
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Patología / sospecha</label>
            <input
              value={patologiaSospecha}
              onChange={(e) => setPatologiaSospecha(e.target.value)}
              placeholder="Ej. Cáncer de mama"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Origen de ingreso</label>
            <select
              value={origenIngreso}
              onChange={(e) => setOrigenIngreso(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="IC">Interconsulta</option>
              <option value="GES">Garantía GES</option>
              <option value="directo">Ingreso directo</option>
            </select>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 px-3 py-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-md px-4 py-2"
            >
              Crear caso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
