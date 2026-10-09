import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Users, Stethoscope, PlusCircle, Lock, Unlock, Pill, Landmark } from 'lucide-react';
import {
  fetchCaso,
  registrarHito,
  registrarComite,
  registrarDerivacion,
  actualizarDerivacion,
  updateCaso,
} from '../lib/api.js';
import { FASE_STYLES, formatFecha, formatFechaHora } from '../lib/ui.js';
import TimelineHitos from './TimelineHitos.jsx';
import PlazosGesCard from './PlazosGesCard.jsx';
import NotasCaso from './NotasCaso.jsx';

const EDITOR_ROLES = ['admin', 'gestor_oncologico', 'enfermera_policlinico'];
// Notas: abierto a cualquier actor que participa del caso (incluida admisión), no solo a quienes
// pueden avanzar hitos — el único rol sin acceso de escritura es "lectura".
const NOTA_ROLES = EDITOR_ROLES.concat('admision');

const HABILITAR_QUIMIO_ROLES = ['enfermera_quimio', 'oncologo', 'gestor_oncologico', 'admin'];

export default function CasoDetailView({ casoId, user, bootstrap, onVolver, onHabilitarQuimio }) {
  const [caso, setCaso] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [hitoSeleccionado, setHitoSeleccionado] = useState('');
  const [comentarioHito, setComentarioHito] = useState('');

  const [comiteFecha, setComiteFecha] = useState('');
  const [comiteDecision, setComiteDecision] = useState('');
  const [comiteObs, setComiteObs] = useState('');

  const [derivacionTipo, setDerivacionTipo] = useState('examen');
  const [derivacionDestino, setDerivacionDestino] = useState('');

  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [motivoCierre, setMotivoCierre] = useState('');

  const puedeEditar = EDITOR_ROLES.includes(user.role);
  const puedeHabilitarQuimio = HABILITAR_QUIMIO_ROLES.includes(user.role);
  const puedeAnotar = NOTA_ROLES.includes(user.role);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCaso(casoId);
      setCaso(data.caso);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el caso.');
    } finally {
      setCargando(false);
    }
  }, [casoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleRegistrarHito(event) {
    event.preventDefault();
    if (!hitoSeleccionado) return;
    await registrarHito(casoId, { hito: hitoSeleccionado, comentario: comentarioHito || null });
    setHitoSeleccionado('');
    setComentarioHito('');
    await cargar();
  }

  async function handleRegistrarComite(event) {
    event.preventDefault();
    if (!comiteFecha) return;
    await registrarComite(casoId, { fecha: comiteFecha, decision: comiteDecision || null, observaciones: comiteObs || null });
    setComiteFecha('');
    setComiteDecision('');
    setComiteObs('');
    await cargar();
  }

  async function handleRegistrarDerivacion(event) {
    event.preventDefault();
    await registrarDerivacion(casoId, { tipo: derivacionTipo, destino: derivacionDestino || null });
    setDerivacionDestino('');
    await cargar();
  }

  async function handleToggleDerivacion(derivacion) {
    await actualizarDerivacion(derivacion.id, { estado: derivacion.estado === 'realizada' ? 'pendiente' : 'realizada' });
    await cargar();
  }

  async function handleAsignarGestor(gestorUserId) {
    await updateCaso(casoId, { gestorUserId: gestorUserId || null });
    await cargar();
  }

  async function handleViaTratamiento(viaTratamiento) {
    await updateCaso(casoId, { viaTratamiento: viaTratamiento || null });
    await cargar();
  }

  async function handleFinanciamiento(financiamiento) {
    await updateCaso(casoId, { financiamiento: financiamiento || null });
    await cargar();
  }

  async function handleCerrarCaso(event) {
    event.preventDefault();
    if (!motivoCierre) return;
    await updateCaso(casoId, { estado: 'cerrado', motivoCierre });
    setMostrarCierre(false);
    await cargar();
  }

  async function handleReabrirCaso() {
    await updateCaso(casoId, { estado: 'activo' });
    await cargar();
  }

  if (cargando) return <div className="text-slate-400 text-sm">Cargando caso…</div>;
  if (error) return <div className="text-red-600 text-sm">{error}</div>;
  if (!caso) return null;

  return (
    <div>
      <button type="button" onClick={onVolver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Volver al listado
      </button>

      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-slate-800">{caso.paciente?.nombre}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FASE_STYLES[caso.fase] ?? 'bg-slate-100 text-slate-700'}`}>
                {caso.faseLabel}
              </span>
              {caso.estado === 'cerrado' && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Cerrado</span>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              RUT {caso.paciente?.rut} · {caso.patologiaSospecha}
              {caso.paciente?.origenOvalle && ' · Paciente de Ovalle'}
            </div>
            <div className="text-sm text-slate-600 mt-1">Hito actual: <span className="font-medium">{caso.hitoLabel}</span></div>
          </div>

          {puedeEditar && (
            <div className="flex flex-col gap-2 text-sm">
              {caso.estado === 'activo' ? (
                <button
                  type="button"
                  onClick={() => setMostrarCierre((v) => !v)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Cerrar caso
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReabrirCaso}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Reabrir caso
                </button>
              )}
            </div>
          )}
        </div>

        {mostrarCierre && (
          <form onSubmit={handleCerrarCaso} className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
            <select
              value={motivoCierre}
              onChange={(e) => setMotivoCierre(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            >
              <option value="">Motivo de cierre…</option>
              {bootstrap.motivosCierre.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button type="submit" className="bg-slate-800 text-white text-sm rounded-md px-3 py-1.5">Confirmar cierre</button>
          </form>
        )}

        {caso.estado === 'cerrado' && (
          <div className="text-sm text-slate-500 mt-2">
            Cerrado el {formatFecha(caso.fechaCierre)} · Motivo: {bootstrap.motivosCierre.find((m) => m.id === caso.motivoCierre)?.label ?? caso.motivoCierre}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <Users className="w-3.5 h-3.5" /> Gestor asignado
            </label>
            <input
              defaultValue={caso.gestor?.name ?? ''}
              disabled
              className="w-full border border-slate-200 bg-slate-50 rounded-md px-3 py-1.5 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <Stethoscope className="w-3.5 h-3.5" /> Vía de tratamiento
            </label>
            <select
              value={caso.viaTratamiento ?? ''}
              disabled={!puedeEditar}
              onChange={(e) => handleViaTratamiento(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Sin definir</option>
              {bootstrap.viasTratamiento.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
              <Landmark className="w-3.5 h-3.5" /> Financiamiento
            </label>
            <select
              value={caso.financiamiento ?? ''}
              disabled={!puedeEditar}
              onChange={(e) => handleFinanciamiento(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Sin definir</option>
              {bootstrap.financiamientos.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <div className="text-[11px] text-slate-400 mt-1">Marcador manual — se identifica antes de llegar a oncología.</div>
          </div>
        </div>
      </div>

      {caso.viaTratamiento === 'quimioterapia' && puedeHabilitarQuimio && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-purple-800 text-sm">
            <Pill className="w-4 h-4" />
            Este caso tiene quimioterapia como vía de tratamiento.
          </div>
          <button
            type="button"
            onClick={() => onHabilitarQuimio?.({ id: caso.paciente.id, nombre: caso.paciente.nombre, rut: caso.paciente.rut })}
            className="text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-md px-3 py-1.5"
          >
            Habilitar quimioterapia para este paciente
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Plazos GES</h2>
            <PlazosGesCard plazos={caso.plazos} puedeEditar={puedeEditar} onCambio={cargar} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Línea de tiempo</h2>
            <TimelineHitos hitos={caso.hitos} />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Notas del equipo</h2>
            <NotasCaso casoId={casoId} notas={caso.notas} puedeEscribir={puedeAnotar} onCambio={cargar} />
          </section>
        </div>

        <div className="space-y-5">
          {puedeEditar && (
            <section className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Registrar avance</h2>
              <form onSubmit={handleRegistrarHito} className="space-y-2">
                <select
                  value={hitoSeleccionado}
                  onChange={(e) => setHitoSeleccionado(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  required
                >
                  <option value="">Selecciona un hito…</option>
                  {bootstrap.fases.map((fase) => (
                    <optgroup key={fase.id} label={fase.label}>
                      {fase.hitos.map((h) => (
                        <option key={h.id} value={h.id}>{h.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <textarea
                  value={comentarioHito}
                  onChange={(e) => setComentarioHito(e.target.value)}
                  placeholder="Comentario (opcional)"
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  rows={2}
                />
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-3 py-1.5">
                  Registrar
                </button>
              </form>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Comité Oncológico</h2>
            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
              {caso.comites?.length ? caso.comites.map((c) => (
                <div key={c.id} className="text-sm border-b border-slate-50 pb-1.5">
                  <div className="font-medium text-slate-700">{formatFecha(c.fecha)}</div>
                  {c.decision && <div className="text-slate-600">{c.decision}</div>}
                  {c.observaciones && <div className="text-xs text-slate-400">{c.observaciones}</div>}
                </div>
              )) : <div className="text-sm text-slate-400">Sin presentaciones registradas.</div>}
            </div>
            {puedeEditar && (
              <form onSubmit={handleRegistrarComite} className="space-y-2 border-t border-slate-100 pt-3">
                <input
                  type="date"
                  value={comiteFecha}
                  onChange={(e) => setComiteFecha(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  required
                />
                <input
                  value={comiteDecision}
                  onChange={(e) => setComiteDecision(e.target.value)}
                  placeholder="Decisión"
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  value={comiteObs}
                  onChange={(e) => setComiteObs(e.target.value)}
                  placeholder="Observaciones"
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <button type="submit" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
                  <PlusCircle className="w-4 h-4" /> Agregar presentación
                </button>
              </form>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Derivaciones</h2>
            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
              {caso.derivaciones?.length ? caso.derivaciones.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => puedeEditar && handleToggleDerivacion(d)}
                  className="w-full text-left text-sm flex items-center justify-between border-b border-slate-50 pb-1.5"
                >
                  <span>
                    <span className="font-medium text-slate-700">{bootstrap.tiposDerivacion.find((t) => t.id === d.tipo)?.label ?? d.tipo}</span>
                    {d.destino && <span className="text-slate-500"> · {d.destino}</span>}
                  </span>
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${d.estado === 'realizada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {d.estado === 'realizada' ? 'Realizada' : 'Pendiente'}
                  </span>
                </button>
              )) : <div className="text-sm text-slate-400">Sin derivaciones registradas.</div>}
            </div>
            {puedeEditar && (
              <form onSubmit={handleRegistrarDerivacion} className="space-y-2 border-t border-slate-100 pt-3">
                <select
                  value={derivacionTipo}
                  onChange={(e) => setDerivacionTipo(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {bootstrap.tiposDerivacion.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <input
                  value={derivacionDestino}
                  onChange={(e) => setDerivacionDestino(e.target.value)}
                  placeholder="Destino (opcional)"
                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <button type="submit" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700">
                  <PlusCircle className="w-4 h-4" /> Agregar derivación
                </button>
              </form>
            )}
          </section>
        </div>
      </div>

      <div className="text-xs text-slate-300 mt-6">Última actualización {formatFechaHora(caso.updatedAt)}</div>
    </div>
  );
}
