export const SEMAFORO_STYLES = {
  vigente: { label: 'Vigente', className: 'bg-emerald-100 text-emerald-700' },
  proximo: { label: 'Próximo a vencer', className: 'bg-amber-100 text-amber-700' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
  cumplido: { label: 'Cumplido', className: 'bg-slate-100 text-slate-600' },
  cumplido_atrasado: { label: 'Cumplido fuera de plazo', className: 'bg-orange-100 text-orange-700' },
};

export const FASE_STYLES = {
  sospecha: 'bg-slate-100 text-slate-700',
  diagnostico_etapificacion: 'bg-indigo-100 text-indigo-700',
  tratamiento: 'bg-blue-100 text-blue-700',
  seguimiento: 'bg-teal-100 text-teal-700',
};

export function formatFecha(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CL');
}

export function formatFechaHora(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CL');
}
