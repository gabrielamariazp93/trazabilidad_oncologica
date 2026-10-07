import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchCiclo, reprogramarCiclo, transicionarCiclo } from '../../lib/api.js';
import { formatFecha, formatFechaHora } from '../../lib/ui.js';
import SelectorDisponibilidad from './SelectorDisponibilidad.jsx';

const ESTADO_STYLES = {
  programado: 'bg-slate-100 text-slate-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  listo_para_administrar: 'bg-indigo-100 text-indigo-700',
  en_administracion: 'bg-blue-100 text-blue-700',
  administrado: 'bg-emerald-100 text-emerald-700',
  suspendido: 'bg-orange-100 text-orange-700',
  cancelado: 'bg-red-100 text-red-700',
};

const ESTADOS_SUSPENDIBLES = ['programado', 'en_preparacion', 'listo_para_administrar', 'en_administracion'];
const ROLES_REPROGRAMAR = ['enfermera_quimio', 'admin'];
const ROLES_SUSPENDER = ['oncologo', 'farmacia', 'enfermera_quimio', 'admin'];
const ROLES_CANCELAR = ['oncologo', 'enfermera_quimio', 'admin'];

export default function DetalleCicloModal({ cicloId, user, onClose, onCambio }) {
  const [ciclo, setCiclo] = useState(null);
  const [error, setError] = useState(null);

  const [accionActiva, setAccionActiva] = useState(null); // null | 'reprogramar' | 'suspender'
  const [alcanceReprogramacion, setAlcanceReprogramacion] = useState(null); // null | 'todos' | 'actual'
  const [nuevaSeleccion, setNuevaSeleccion] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [accionError, setAccionError] = useState(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    fetchCiclo(cicloId)
      .then((data) => setCiclo(data.ciclo))
      .catch((err) => setError(err.message || 'No se pudo cargar el ciclo.'));
  }, [cicloId]);

  function resetAccion() {
    setAccionActiva(null);
    setAlcanceReprogramacion(null);
    setNuevaSeleccion(null);
    setMotivo('');
    setAccionError(null);
  }

  async function handleConfirmarReprogramacion() {
    if (!nuevaSeleccion) return;
    setAccionError(null);
    setProcesando(true);
    try {
      const data = await reprogramarCiclo(ciclo.id, {
        fechaProgramada: nuevaSeleccion.fecha,
        horaInicio: nuevaSeleccion.horaInicio,
        sillonId: nuevaSeleccion.sillonId,
        aplicarATodos: alcanceReprogramacion === 'todos',
      });
      setCiclo(data.ciclo);
      resetAccion();
      onCambio?.();
    } catch (err) {
      setAccionError(err.message || 'No se pudo reprogramar la sesión.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleTransicion(accion) {
    setAccionError(null);
    setProcesando(true);
    try {
      const data = await transicionarCiclo(ciclo.id, { accion, comentario: motivo.trim() });
      setCiclo(data.ciclo);
      resetAccion();
      onCambio?.();
    } catch (err) {
      setAccionError(err.message || 'No se pudo aplicar la acción.');
    } finally {
      setProcesando(false);
    }
  }

  const puedeReprogramar = user && ROLES_REPROGRAMAR.includes(user.role);
  const puedeSuspender = user && ROLES_SUSPENDER.includes(user.role);
  const puedeCancelar = user && ROLES_CANCELAR.includes(user.role);

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-30 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Detalle de la sesión</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!ciclo && !error && <div className="text-sm text-slate-400">Cargando…</div>}

          {ciclo && (
            <>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-slate-800">{ciclo.receta?.paciente?.nombre}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_STYLES[ciclo.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                    {ciclo.estadoLabel}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">RUT {ciclo.receta?.paciente?.rut} · {ciclo.receta?.protocolo}</div>
              </div>

              <div className="text-sm text-slate-600 grid grid-cols-2 gap-y-1">
                <div><span className="text-slate-400">Ciclo</span> {ciclo.numeroCiclo}</div>
                <div><span className="text-slate-400">Sillón</span> {ciclo.sillon?.nombre ?? '—'}</div>
                <div><span className="text-slate-400">Fecha</span> {formatFecha(ciclo.fechaProgramada)}</div>
                <div><span className="text-slate-400">Horario</span> {ciclo.horaInicio}–{ciclo.horaTermino}</div>
              </div>

              {ciclo.observaciones && (
                <div className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2">{ciclo.observaciones}</div>
              )}
              {ciclo.motivoSuspension && (
                <div className="text-sm text-orange-700 bg-orange-50 rounded-md px-3 py-2">Suspendido: {ciclo.motivoSuspension}</div>
              )}

              {!accionActiva && (puedeReprogramar || puedeSuspender) && (
                <div className="flex items-center gap-2 pt-1">
                  {puedeReprogramar && ciclo.estado === 'programado' && (
                    <button type="button" onClick={() => setAccionActiva('reprogramar')} className="text-sm border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50">
                      Reprogramar
                    </button>
                  )}
                  {(puedeSuspender || puedeCancelar) && ESTADOS_SUSPENDIBLES.includes(ciclo.estado) && (
                    <button type="button" onClick={() => setAccionActiva('suspender')} className="text-sm border border-orange-300 text-orange-700 rounded-md px-3 py-1.5 hover:bg-orange-50">
                      Suspender / Cancelar
                    </button>
                  )}
                </div>
              )}

              {accionActiva === 'reprogramar' && (
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  {!alcanceReprogramacion ? (
                    <div>
                      <div className="text-sm text-slate-700 mb-2">¿Reprogramar todos los ciclos restantes de esta receta o solo este?</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAlcanceReprogramacion('todos')} className="flex-1 text-sm border border-blue-200 text-blue-700 rounded-md px-3 py-2 hover:bg-blue-50">
                          Todos los ciclos restantes
                        </button>
                        <button type="button" onClick={() => setAlcanceReprogramacion('actual')} className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50">
                          Solo este ciclo
                        </button>
                      </div>
                      <button type="button" onClick={resetAccion} className="text-xs text-slate-400 hover:text-slate-600 mt-2">Cancelar</button>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-slate-500 mb-2">
                        Elige el nuevo horario{alcanceReprogramacion === 'todos' ? ' — los ciclos siguientes de esta receta se moverán el mismo número de días, manteniendo su hora y sillón' : ' para este ciclo'}.
                      </div>
                      <SelectorDisponibilidad
                        fechaInicial={ciclo.fechaProgramada.slice(0, 10)}
                        duracionMin={ciclo.duracionEstimadaMin}
                        value={nuevaSeleccion}
                        onChange={setNuevaSeleccion}
                      />
                      {accionError && <div className="text-sm text-red-600 mt-2">{accionError}</div>}
                      <div className="flex justify-end gap-2 mt-3">
                        <button type="button" onClick={resetAccion} className="text-sm text-slate-500 px-3 py-1.5">Cancelar</button>
                        <button
                          type="button"
                          disabled={!nuevaSeleccion || procesando}
                          onClick={handleConfirmarReprogramacion}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-3 py-1.5"
                        >
                          Confirmar reprogramación
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {accionActiva === 'suspender' && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <label className="block text-xs font-medium text-slate-500">Motivo</label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={2}
                    placeholder="Describe el motivo…"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                  <div className="text-sm text-slate-700">¿Dejas la sesión pendiente (para reprogramar después) o la cancelas definitivamente?</div>
                  {accionError && <div className="text-sm text-red-600">{accionError}</div>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={resetAccion} className="text-sm text-slate-500 px-3 py-1.5">Volver</button>
                    {puedeSuspender && (
                      <button
                        type="button"
                        disabled={!motivo.trim() || procesando}
                        onClick={() => handleTransicion('suspender')}
                        className="border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50 text-sm font-medium rounded-md px-3 py-1.5"
                      >
                        Dejar pendiente
                      </button>
                    )}
                    {puedeCancelar && ciclo.estado === 'programado' && (
                      <button
                        type="button"
                        disabled={!motivo.trim() || procesando}
                        onClick={() => handleTransicion('cancelar')}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-3 py-1.5"
                      >
                        Cancelar ciclo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!!ciclo.historial?.length && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Historial</div>
                  <div className="space-y-1">
                    {ciclo.historial.map((h) => (
                      <div key={h.id} className="text-xs text-slate-500">
                        {formatFechaHora(h.fecha)} — {h.estadoLabel}{h.actor ? ` · ${h.actor.name}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!accionActiva && (
                <div className="text-xs text-slate-400 pt-2">
                  Para preparar o administrar esta sesión, ve a las pestañas Preparación / Administración.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
