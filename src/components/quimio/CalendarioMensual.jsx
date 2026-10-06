import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCalendarioQuimio } from '../../lib/api.js';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function primerDiaDelMes(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function ultimoDiaDelMes(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// Lunes=0..Domingo=6, para alinear la grilla con semana empezando en lunes.
function columnaLunesPrimero(date) {
  const dia = date.getUTCDay();
  return dia === 0 ? 6 : dia - 1;
}

export default function CalendarioMensual({ fechaSeleccionada, onSeleccionar }) {
  const [mesVisible, setMesVisible] = useState(() => {
    const base = fechaSeleccionada ? new Date(fechaSeleccionada) : new Date();
    return primerDiaDelMes(base);
  });
  const [diasInfo, setDiasInfo] = useState({});
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const desde = primerDiaDelMes(mesVisible);
      const hasta = ultimoDiaDelMes(mesVisible);
      const data = await fetchCalendarioQuimio(toISODate(desde), toISODate(hasta));
      const mapa = {};
      data.dias.forEach((d) => {
        mapa[d.fecha] = d;
      });
      setDiasInfo(mapa);
    } finally {
      setCargando(false);
    }
  }, [mesVisible]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const primerDia = primerDiaDelMes(mesVisible);
  const ultimoDia = ultimoDiaDelMes(mesVisible);
  const relleno = columnaLunesPrimero(primerDia);

  const celdas = [];
  for (let i = 0; i < relleno; i++) celdas.push(null);
  for (let d = 1; d <= ultimoDia.getUTCDate(); d++) {
    celdas.push(new Date(Date.UTC(mesVisible.getUTCFullYear(), mesVisible.getUTCMonth(), d)));
  }

  const hoyISO = toISODate(new Date());

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setMesVisible((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)))}
          className="text-slate-400 hover:text-slate-700 p-1"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium text-slate-700">
          {MESES[mesVisible.getUTCMonth()]} {mesVisible.getUTCFullYear()}
        </div>
        <button
          type="button"
          onClick={() => setMesVisible((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)))}
          className="text-slate-400 hover:text-slate-700 p-1"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-1 ${cargando ? 'opacity-50' : ''}`}>
        {celdas.map((fecha, idx) => {
          if (!fecha) return <div key={`vacio-${idx}`} />;
          const iso = toISODate(fecha);
          const info = diasInfo[iso];
          const habil = info?.habil ?? false;
          const feriado = info?.feriado ?? false;
          const seleccionado = iso === fechaSeleccionada;
          const esHoy = iso === hoyISO;

          return (
            <button
              type="button"
              key={iso}
              disabled={!habil}
              onClick={() => onSeleccionar(iso)}
              className={`relative aspect-square rounded-md text-sm flex items-center justify-center ${
                seleccionado
                  ? 'bg-blue-600 text-white font-medium'
                  : habil
                    ? `text-slate-700 hover:bg-blue-50 ${esHoy ? 'ring-1 ring-blue-400' : ''}`
                    : 'text-slate-300 cursor-not-allowed'
              }`}
              title={feriado ? 'Feriado' : !habil ? 'No hábil' : undefined}
            >
              {fecha.getUTCDate()}
              {feriado && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
