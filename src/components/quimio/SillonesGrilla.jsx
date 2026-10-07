import React, { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { fetchDisponibilidadQuimio } from '../../lib/api.js';
import { formatFecha } from '../../lib/ui.js';
import CalendarioMensual from './CalendarioMensual.jsx';
import AgendaDiaGrid from './AgendaDiaGrid.jsx';
import AgendarCicloForm from './AgendarCicloForm.jsx';
import DetalleCicloModal from './DetalleCicloModal.jsx';
import ListaEsperaPacientes from './ListaEsperaPacientes.jsx';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const AGENDA_ROLES = ['enfermera_quimio', 'admin'];

// Vista principal del módulo: calendario mensual (solo días hábiles seleccionables) + agenda del
// día con los 16 sillones en columnas. Cualquier bloque libre es "clickeable" acá (modo
// "explorar" de AgendaDiaGrid, sin duración todavía — se agenda sin filtrar por duración y el
// backend valida el choque real contra la duración de la receta elegida al confirmar).
export default function SillonesGrilla({ user }) {
  const [fecha, setFecha] = useState(todayISO());
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seleccionNueva, setSeleccionNueva] = useState(null);
  const [cicloSeleccionado, setCicloSeleccionado] = useState(null);
  const [listaVersion, setListaVersion] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await fetchDisponibilidadQuimio(fecha, 30);
      setDisponibilidad(data);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la agenda.');
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puedeAgendar = AGENDA_ROLES.includes(user.role);

  function handleSeleccionarLibre(sillonId, horaInicio) {
    if (!puedeAgendar) return;
    const sillon = disponibilidad.sillones.find((s) => s.id === sillonId);
    setSeleccionNueva({ fecha, sillonId, horaInicio, sillonNombre: sillon?.nombre });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Sillones</h2>
        {puedeAgendar && (
          <button
            type="button"
            onClick={() => setSeleccionNueva({})}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-3 py-2"
          >
            <Plus className="w-4 h-4" /> Agendar ciclo
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-4">
          <div className="border border-slate-200 rounded-lg p-3 h-fit">
            <CalendarioMensual fechaSeleccionada={fecha} onSeleccionar={setFecha} />
          </div>
          <ListaEsperaPacientes refreshKey={listaVersion} />
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">{formatFecha(fecha)}</div>

          {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
          {cargando && <div className="text-sm text-slate-400">Cargando agenda…</div>}

          {!cargando && disponibilidad && !disponibilidad.habil && (
            <div className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">
              {disponibilidad.feriado ? 'Ese día es feriado.' : 'Ese día no es hábil.'}
            </div>
          )}

          {!cargando && disponibilidad?.habil && (
            <AgendaDiaGrid
              disponibilidad={disponibilidad}
              value={null}
              onSeleccionarLibre={handleSeleccionarLibre}
              onSeleccionarOcupado={(_sillon, bloque) => setCicloSeleccionado(bloque.ciclo.id)}
              soloValidos={false}
            />
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-50 border border-emerald-200 inline-block" /> Libre — click para agendar</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-100 inline-block" /> Ocupado — click para ver detalle</span>
          </div>
        </div>
      </div>

      {seleccionNueva && (
        <AgendarCicloForm
          fechaInicial={seleccionNueva.fecha}
          seleccionInicial={seleccionNueva.sillonId ? seleccionNueva : null}
          onClose={() => setSeleccionNueva(null)}
          onCreado={() => {
            setSeleccionNueva(null);
            cargar();
            setListaVersion((v) => v + 1);
          }}
        />
      )}

      {cicloSeleccionado && (
        <DetalleCicloModal
          cicloId={cicloSeleccionado}
          user={user}
          onClose={() => setCicloSeleccionado(null)}
          onCambio={() => {
            cargar();
            setListaVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
