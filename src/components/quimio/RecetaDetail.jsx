import React, { useState } from 'react';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { validarReceta, rechazarReceta } from '../../lib/api.js';
import { formatFecha, formatFechaHora } from '../../lib/ui.js';

const ESTADO_STYLES = {
  borrador: 'bg-slate-100 text-slate-700',
  validada: 'bg-emerald-100 text-emerald-700',
  rechazada: 'bg-red-100 text-red-700',
  anulada: 'bg-slate-200 text-slate-600',
};

const CICLO_ESTADO_STYLES = {
  programado: 'bg-slate-100 text-slate-700',
  en_preparacion: 'bg-amber-100 text-amber-700',
  listo_para_administrar: 'bg-indigo-100 text-indigo-700',
  en_administracion: 'bg-blue-100 text-blue-700',
  administrado: 'bg-emerald-100 text-emerald-700',
  suspendido: 'bg-orange-100 text-orange-700',
  cancelado: 'bg-red-100 text-red-700',
};

export default function RecetaDetail({ receta, user, onVolver, onCambio }) {
  const [observaciones, setObservaciones] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const puedeValidar = user.role === 'farmacia' || user.role === 'admin';

  async function handleValidar() {
    setError(null);
    setGuardando(true);
    try {
      await validarReceta(receta.id, observaciones || undefined);
      await onCambio();
    } catch (err) {
      setError(err.message || 'No se pudo validar la receta.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleRechazar(event) {
    event.preventDefault();
    if (!motivoRechazo.trim()) return;
    setError(null);
    setGuardando(true);
    try {
      await rechazarReceta(receta.id, motivoRechazo.trim());
      await onCambio();
    } catch (err) {
      setError(err.message || 'No se pudo rechazar la receta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onVolver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a recetas
      </button>

      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-slate-800">{receta.paciente?.nombre}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_STYLES[receta.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                {receta.estadoLabel}
              </span>
            </div>
            <div className="text-sm text-slate-500 mt-1">RUT {receta.paciente?.rut} · {receta.protocolo}</div>
            {receta.diagnostico && <div className="text-sm text-slate-600 mt-1">{receta.diagnostico}{receta.intencionLabel ? ` · ${receta.intencionLabel}` : ''}</div>}
            {receta.indicacion && <div className="text-sm text-slate-600 mt-1">{receta.indicacion}</div>}
            <div className="text-xs text-slate-400 mt-1">
              {receta.numeroCiclosTotal} ciclos · cada {receta.intervaloDias} días
              {receta.pesoKg && receta.tallaCm ? ` · ${receta.pesoKg} kg, ${receta.tallaCm} cm` : ''}
              {receta.superficieCorporal ? ` · SC ${receta.superficieCorporal} m²` : ''}
              {receta.riesgoEmeticoLabel ? ` · Riesgo emético ${receta.riesgoEmeticoLabel.toLowerCase()}` : ''}
              {receta.medico ? ` · Prescrito por ${receta.medico.name}` : ''}
            </div>
            {(receta.otrasIndicaciones || receta.neupogenIndicado) && (
              <div className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-md px-2.5 py-1.5">
                {receta.otrasIndicaciones && <div>{receta.otrasIndicaciones}</div>}
                {receta.neupogenIndicado && <div>Neupogen indicado{receta.neupogenDias ? ` · ${receta.neupogenDias}` : ''}</div>}
              </div>
            )}
          </div>
        </div>

        {receta.estado === 'borrador' && puedeValidar && (
          <div className="border-t border-slate-100 mt-4 pt-4 space-y-2">
            {!mostrarRechazo ? (
              <div className="flex items-center gap-2">
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones de validación (opcional)"
                  className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
                />
                <button type="button" disabled={guardando} onClick={handleValidar} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md px-3 py-1.5">
                  <CheckCircle className="w-4 h-4" /> Validar
                </button>
                <button type="button" onClick={() => setMostrarRechazo(true)} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-md px-3 py-1.5">
                  <XCircle className="w-4 h-4" /> Rechazar
                </button>
              </div>
            ) : (
              <form onSubmit={handleRechazar} className="flex items-center gap-2">
                <input
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Motivo del rechazo"
                  required
                  className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
                />
                <button type="submit" disabled={guardando} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md px-3 py-1.5">
                  Confirmar rechazo
                </button>
                <button type="button" onClick={() => setMostrarRechazo(false)} className="text-sm text-slate-500 px-2">Cancelar</button>
              </form>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        )}

        {receta.estado !== 'borrador' && receta.farmaceutico && (
          <div className="text-xs text-slate-400 border-t border-slate-100 mt-4 pt-3">
            {receta.estadoLabel} por {receta.farmaceutico.name} el {formatFecha(receta.fechaValidacion)}
            {receta.observacionesValidacion ? ` — "${receta.observacionesValidacion}"` : ''}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Fármacos</h2>
          {['premedicacion', 'quimioterapia', 'rescate'].map((categoria) => {
            const items = receta.farmacos?.filter((f) => f.categoria === categoria) ?? [];
            if (!items.length) return null;
            return (
              <div key={categoria} className="mb-3 last:mb-0">
                <div className="text-xs font-medium text-slate-500 mb-1">{items[0].categoriaLabel}</div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {items.map((f) => (
                      <tr key={f.id}>
                        <td className="py-1.5 text-slate-700 pr-2">{f.farmaco}</td>
                        <td className="py-1.5 text-slate-600 pr-2">{f.dosis} {f.unidad}</td>
                        <td className="py-1.5 text-slate-600 pr-2">{f.via}{f.duracionInfusionMin ? ` · ${f.duracionInfusionMin} min` : ''}</td>
                        <td className="py-1.5 text-slate-400">{f.frecuencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Ciclos</h2>
          {!receta.ciclos?.length && <div className="text-sm text-slate-400">Sin ciclos agendados todavía.</div>}
          <div className="space-y-2">
            {receta.ciclos?.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-1.5">
                <span className="text-slate-700">Ciclo {c.numeroCiclo} — {formatFecha(c.fechaProgramada)} {c.horaInicio}–{c.horaTermino}{c.sillon ? ` · ${c.sillon.nombre}` : ''}</span>
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${CICLO_ESTADO_STYLES[c.estado] ?? 'bg-slate-100 text-slate-700'}`}>{c.estadoLabel}</span>
              </div>
            ))}
          </div>
          {receta.estado === 'validada' && (
            <div className="text-xs text-slate-400 mt-3">Para agendar una sesión, ve al Tablero del paciente.</div>
          )}
        </section>
      </div>
    </div>
  );
}
