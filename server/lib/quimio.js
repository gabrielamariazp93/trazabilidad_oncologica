// Módulo de Quimioterapia: receta -> validación (enfermera de oncología) -> agenda de sillón ->
// preparación (químico farmacéutico) -> administración -> estadística. Independiente de
// CasoOncologico (comparte solo Paciente).
// Mismo patrón arquitectónico que casos.js: entidad + historial de transiciones de estado.

// El servidor puede correr en cualquier timezone local (ej. America/Santiago, UTC-3) pero las
// fechas de DiaHabilQuimio se siembran como medianoche UTC exacta ("2027-01-04" -> UTC
// midnight). Truncar con setHours() opera en hora LOCAL y desfasa el día — por eso todo el
// módulo normaliza fechas-calendario con esta función en vez de setHours(0,0,0,0).
export function truncarFechaUTC(fecha) {
  const d = new Date(fecha);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const ESTADOS_RECETA = ['borrador', 'validada', 'rechazada', 'anulada'];

export const ESTADO_RECETA_LABELS = {
  borrador: 'Borrador',
  validada: 'Validada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
};

export const ESTADOS_CICLO_ACTIVOS = [
  'programado',
  'en_preparacion',
  'listo_para_administrar',
  'en_administracion',
  'administrado',
];

export const ESTADO_CICLO_LABELS = {
  programado: 'Programado',
  en_preparacion: 'En preparación',
  listo_para_administrar: 'Listo para administrar',
  en_administracion: 'En administración',
  administrado: 'Administrado',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado',
};

export const CATEGORIAS_FARMACO = ['premedicacion', 'quimioterapia', 'rescate'];

export const CATEGORIA_FARMACO_LABELS = {
  premedicacion: 'Premedicación',
  quimioterapia: 'Quimioterapia',
  rescate: 'Rescate / PRN',
};

export const INTENCIONES = ['curativa', 'neoadyuvante', 'adyuvante', 'paliativa'];

export const INTENCION_LABELS = {
  curativa: 'Curativa',
  neoadyuvante: 'Neoadyuvante',
  adyuvante: 'Adyuvante',
  paliativa: 'Paliativa',
};

export const RIESGOS_EMETICOS = ['minimo', 'bajo', 'moderado', 'alto'];

export const RIESGO_EMETICO_LABELS = {
  minimo: 'Mínimo',
  bajo: 'Bajo',
  moderado: 'Moderado',
  alto: 'Alto',
};

export const ESTADIOS = ['I', 'II', 'III', 'IV'];

export const ESTADIO_LABELS = {
  I: 'Etapa I',
  II: 'Etapa II',
  III: 'Etapa III',
  IV: 'Etapa IV',
};

// Fórmula de Mosteller — la misma que usan la mayoría de los protocolos de quimio para calcular
// superficie corporal a partir de peso/talla.
export function calcularSuperficieCorporal(pesoKg, tallaCm) {
  if (!pesoKg || !tallaCm) return null;
  return Math.round(Math.sqrt((pesoKg * tallaCm) / 3600) * 100) / 100;
}

// Calendario real: ver DiaHabilQuimio (importado de prisma/data/calendario_2027.json) — tiene
// prioridad siempre que exista una fila para la fecha. Fuera de ese rango (otros años) se usa
// este fallback, que replica la regla general del Excel "Base QMT" en vez de un horario fijo:
// lunes-jueves hasta 16:45, viernes hasta 15:45, y dos fechas especiales que se repiten todos
// los años (17 de septiembre, 24 de diciembre) hasta 11:45.
const FALLBACK_HORA_INICIO = '08:15';
const FALLBACK_HORA_FIN = '16:45';
const FALLBACK_HORA_FIN_VIERNES = '15:45';
const FALLBACK_HORA_FIN_ESPECIAL = '11:45';
export const PASO_BLOQUE_MIN = 30;

function esFechaEspecialMediaJornada(fecha) {
  const d = new Date(fecha);
  const mes = d.getUTCMonth() + 1;
  const dia = d.getUTCDate();
  return (mes === 9 && dia === 17) || (mes === 12 && dia === 24);
}

// Resuelve la config hábil/horario de un día: usa la fila real de DiaHabilQuimio si existe
// (el caller la busca y la pasa acá — esta función queda pura/testeable), si no, cae al
// fallback descrito arriba.
export function resolverConfigDia(diaHabilRow, fecha) {
  if (diaHabilRow) {
    return { habil: diaHabilRow.habil, feriado: diaHabilRow.feriado, horaInicio: diaHabilRow.horaInicio, horaFin: diaHabilRow.horaFin };
  }
  const diaSemana = new Date(fecha).getUTCDay(); // 0=domingo..6=sábado
  const habil = diaSemana >= 1 && diaSemana <= 5;
  if (!habil) return { habil: false, feriado: false, horaInicio: null, horaFin: null };

  if (esFechaEspecialMediaJornada(fecha)) {
    return { habil: true, feriado: false, horaInicio: FALLBACK_HORA_INICIO, horaFin: FALLBACK_HORA_FIN_ESPECIAL };
  }
  const esViernes = diaSemana === 5;
  return { habil: true, feriado: false, horaInicio: FALLBACK_HORA_INICIO, horaFin: esViernes ? FALLBACK_HORA_FIN_VIERNES : FALLBACK_HORA_FIN };
}

function minutosDesdeHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function horaDesdeMinutos(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sumarMinutos(hora, minutos) {
  return horaDesdeMinutos(minutosDesdeHora(hora) + minutos);
}

export function seSuperponen(horaInicioA, horaTerminoA, horaInicioB, horaTerminoB) {
  const aIni = minutosDesdeHora(horaInicioA);
  const aFin = minutosDesdeHora(horaTerminoA);
  const bIni = minutosDesdeHora(horaInicioB);
  const bFin = minutosDesdeHora(horaTerminoB);
  return aIni < bFin && aFin > bIni;
}

// Horarios de inicio posibles (pasos de 30 min) dentro de la ventana hábil del día donde cabe
// una reserva de duracionMin consecutivos sin chocar con los ciclos ya agendados en ese sillón
// ese día. ciclosDelSillon: [{horaInicio, horaTermino}].
export function calcularBloquesLibres(configDia, ciclosDelSillon, duracionMin) {
  if (!configDia.habil || !configDia.horaInicio || !configDia.horaFin) return [];
  const inicioMin = minutosDesdeHora(configDia.horaInicio);
  const finMin = minutosDesdeHora(configDia.horaFin);
  const ocupados = ciclosDelSillon.map((c) => [minutosDesdeHora(c.horaInicio), minutosDesdeHora(c.horaTermino)]);

  const libres = [];
  for (let inicio = inicioMin; inicio + duracionMin <= finMin; inicio += PASO_BLOQUE_MIN) {
    const fin = inicio + duracionMin;
    const choca = ocupados.some(([oi, of_]) => inicio < of_ && fin > oi);
    if (!choca) libres.push(horaDesdeMinutos(inicio));
  }
  return libres;
}

// Todos los bloques de 30 min del día (toda la jornada hábil, no solo los que alcanzan para una
// duración específica) — es la base de la grilla tipo "agenda" (sillones en columnas, horario en
// filas) que pide la usuaria.
export function listarBloquesDia(configDia) {
  if (!configDia.habil || !configDia.horaInicio || !configDia.horaFin) return [];
  const inicioMin = minutosDesdeHora(configDia.horaInicio);
  const finMin = minutosDesdeHora(configDia.horaFin);
  const bloques = [];
  for (let m = inicioMin; m < finMin; m += PASO_BLOQUE_MIN) bloques.push(horaDesdeMinutos(m));
  return bloques;
}

// Arma la agenda del día para UN sillón: cada bloque de 30 min marcado como ocupado (con el
// ciclo que lo cubre) o libre, y si además alcanza para una reserva de duracionMin consecutivos
// (bloques libres pero "no alcanza" quedan visibles, solo no son seleccionables).
export function construirAgendaDia(configDia, ciclosDelSillon, duracionMin) {
  const bloques = listarBloquesDia(configDia);
  const validos = new Set(calcularBloquesLibres(configDia, ciclosDelSillon, duracionMin));
  return bloques.map((hora) => {
    const finBloque = sumarMinutos(hora, PASO_BLOQUE_MIN);
    const ciclo = ciclosDelSillon.find((c) => seSuperponen(hora, finBloque, c.horaInicio, c.horaTermino));
    return {
      hora,
      ocupado: !!ciclo,
      valido: !ciclo && validos.has(hora),
      ciclo: ciclo
        ? {
            id: ciclo.id,
            numeroCiclo: ciclo.numeroCiclo,
            estado: ciclo.estado,
            estadoLabel: ESTADO_CICLO_LABELS[ciclo.estado] ?? ciclo.estado,
            pacienteNombre: ciclo.pacienteNombre ?? null,
          }
        : null,
    };
  });
}

// Catálogo de transiciones válidas de CicloQuimio. `roles` son los roles (además de admin, que
// siempre puede) habilitados para ejecutar la acción — la validación de rol la hace el router
// leyendo esta misma tabla, así la autorización vive junto a la máquina de estados.
export const ACCIONES_CICLO = {
  iniciar_preparacion: { desde: ['programado'], hacia: 'en_preparacion', roles: ['quimico_farmaceutico'] },
  marcar_listo: { desde: ['en_preparacion'], hacia: 'listo_para_administrar', roles: ['quimico_farmaceutico'] },
  iniciar_administracion: { desde: ['listo_para_administrar'], hacia: 'en_administracion', roles: ['enfermera_quimio'] },
  finalizar_administracion: { desde: ['en_administracion'], hacia: 'administrado', roles: ['enfermera_quimio'] },
  suspender: {
    desde: ['programado', 'en_preparacion', 'listo_para_administrar', 'en_administracion'],
    hacia: 'suspendido',
    roles: ['oncologo', 'quimico_farmaceutico', 'enfermera_quimio'],
    requiereMotivo: true,
  },
  cancelar: { desde: ['programado'], hacia: 'cancelado', roles: ['oncologo', 'enfermera_quimio'] },
};

export function rolPuedeAccion(role, accion) {
  if (role === 'admin') return true;
  return ACCIONES_CICLO[accion]?.roles.includes(role) ?? false;
}

// Aplica una transición de estado a un CicloQuimio: valida que el estado actual admita la
// acción, actualiza los campos correspondientes y deja constancia en HistorialCiclo (misma idea
// que aplicarHito en casos.js). La validación de rol ya se hizo en el router antes de llamar acá.
// `detalle`: campos opcionales de la planilla real que se completan en pasos específicos —
// preparación (lote/caducidad/laboratorio/volúmenes/visados, con "marcar_listo") o acceso
// vascular (catéter/refluye/perfunde/enfermera que punciona/días puncionado, con
// "iniciar_administracion"/"finalizar_administracion"). Se guardan tal cual si vienen, sin
// exigirlos — la planilla real tampoco los completa todos de una vez.
const CAMPOS_PREPARACION = ['lote', 'fechaCaducidadLote', 'laboratorio', 'volumenDosisMl', 'volumenSueroMl', 'volumenFinalMl', 'volumenResidualMl', 'vistoBuenoFarmaceutico', 'vistoBuenoQuimico'];
const CAMPOS_ACCESO_VASCULAR = ['cateterTipo', 'instalacionCateter', 'refluye', 'perfunde', 'enfPuncionaUserId', 'diasPuncionado'];

export async function aplicarTransicionCiclo(tx, { ciclo, accion, actorUserId, comentario, fecha, observaciones, reaccionAdversa, detalle }) {
  const definicion = ACCIONES_CICLO[accion];
  if (!definicion) throw new Error(`Acción desconocida: ${accion}`);
  if (!definicion.desde.includes(ciclo.estado)) {
    throw new Error(`No se puede aplicar "${accion}" a un ciclo en estado "${ciclo.estado}".`);
  }
  if (definicion.requiereMotivo && !comentario) {
    throw new Error('Esta acción requiere indicar un motivo.');
  }

  const ahora = fecha ? new Date(fecha) : new Date();
  const data = { estado: definicion.hacia };

  if (accion === 'iniciar_preparacion') data.preparadoPorUserId = actorUserId ?? null;
  if (accion === 'marcar_listo') {
    data.fechaPreparacion = ahora;
    for (const campo of CAMPOS_PREPARACION) {
      if (detalle?.[campo] !== undefined) data[campo] = campo === 'fechaCaducidadLote' && detalle[campo] ? new Date(detalle[campo]) : detalle[campo];
    }
  }
  if (accion === 'iniciar_administracion') {
    data.administradoPorUserId = actorUserId ?? null;
    data.fechaInicioReal = ahora;
    for (const campo of CAMPOS_ACCESO_VASCULAR) {
      if (detalle?.[campo] !== undefined) data[campo] = detalle[campo];
    }
  }
  if (accion === 'finalizar_administracion') {
    data.fechaTerminoReal = ahora;
    if (observaciones !== undefined) data.observaciones = observaciones;
    if (reaccionAdversa !== undefined) data.reaccionAdversa = !!reaccionAdversa;
    for (const campo of CAMPOS_ACCESO_VASCULAR) {
      if (detalle?.[campo] !== undefined) data[campo] = detalle[campo];
    }
  }
  if (accion === 'suspender') data.motivoSuspension = comentario;

  await tx.cicloQuimio.update({ where: { id: ciclo.id }, data });
  await tx.historialCiclo.create({
    data: {
      cicloId: ciclo.id,
      estado: definicion.hacia,
      fecha: ahora,
      actorUserId: actorUserId ?? null,
      comentario: comentario ?? null,
    },
  });
}

export function serializeDetalleFarmaco(d) {
  return {
    id: d.id,
    categoria: d.categoria,
    categoriaLabel: CATEGORIA_FARMACO_LABELS[d.categoria] ?? d.categoria,
    farmaco: d.farmaco,
    dosis: d.dosis,
    unidad: d.unidad,
    via: d.via,
    frecuencia: d.frecuencia,
    nSesion: d.nSesion,
    clasificacion: d.clasificacion,
    duracionInfusionMin: d.duracionInfusionMin,
    orden: d.orden,
  };
}

export function serializeLineaEsquema(l) {
  return {
    id: l.id,
    droga: l.droga,
    nSesion: l.nSesion,
    nCicloCalculado: l.nCicloCalculado,
    freqEntreSesiones: l.freqEntreSesiones,
    freqEntreCiclos: l.freqEntreCiclos,
    horasSillon: l.horasSillon,
    orden: l.orden,
  };
}

export function serializeEsquema(esquema) {
  return {
    id: esquema.id,
    nombre: esquema.nombre,
    activo: esquema.activo,
    codigoPpvId: esquema.codigoPpvId,
    codigoPpv: esquema.codigoPpv ? serializeCodigoPpv(esquema.codigoPpv) : null,
    lineas: esquema.lineas ? esquema.lineas.map(serializeLineaEsquema) : undefined,
  };
}

export function serializeReceta(receta) {
  return {
    id: receta.id,
    pacienteId: receta.pacienteId,
    paciente: receta.paciente ? { id: receta.paciente.id, rut: receta.paciente.rut, nombre: receta.paciente.nombre } : null,
    medico: receta.medico ? { id: receta.medico.id, name: receta.medico.name } : null,
    esquemaId: receta.esquemaId,
    esquema: receta.esquema ? { id: receta.esquema.id, nombre: receta.esquema.nombre } : null,
    codigoGesId: receta.codigoGesId,
    codigoGes: receta.codigoGes ? serializeCodigoGes(receta.codigoGes) : null,
    codigoPpvId: receta.codigoPpvId,
    codigoPpv: receta.codigoPpv ? serializeCodigoPpv(receta.codigoPpv) : null,
    protocolo: receta.protocolo,
    indicacion: receta.indicacion,
    diagnostico: receta.diagnostico,
    estadio: receta.estadio,
    estadioLabel: receta.estadio ? (ESTADIO_LABELS[receta.estadio] ?? receta.estadio) : null,
    intencion: receta.intencion,
    intencionLabel: receta.intencion ? (INTENCION_LABELS[receta.intencion] ?? receta.intencion) : null,
    riesgoEmetico: receta.riesgoEmetico,
    riesgoEmeticoLabel: receta.riesgoEmetico ? (RIESGO_EMETICO_LABELS[receta.riesgoEmetico] ?? receta.riesgoEmetico) : null,
    numeroCiclosTotal: receta.numeroCiclosTotal,
    intervaloDias: receta.intervaloDias,
    pesoKg: receta.pesoKg,
    tallaCm: receta.tallaCm,
    superficieCorporal: receta.superficieCorporal,
    otrasIndicaciones: receta.otrasIndicaciones,
    neupogenIndicado: receta.neupogenIndicado,
    neupogenDias: receta.neupogenDias,
    estado: receta.estado,
    estadoLabel: ESTADO_RECETA_LABELS[receta.estado] ?? receta.estado,
    farmaceutico: receta.farmaceutico ? { id: receta.farmaceutico.id, name: receta.farmaceutico.name } : null,
    fechaValidacion: receta.fechaValidacion,
    observacionesValidacion: receta.observacionesValidacion,
    createdAt: receta.createdAt,
    updatedAt: receta.updatedAt,
    farmacos: receta.farmacos ? receta.farmacos.map(serializeDetalleFarmaco) : undefined,
    ciclos: receta.ciclos ? receta.ciclos.map(serializeCiclo) : undefined,
  };
}

export function serializeCiclo(ciclo) {
  return {
    id: ciclo.id,
    recetaId: ciclo.recetaId,
    receta: ciclo.receta
      ? { id: ciclo.receta.id, protocolo: ciclo.receta.protocolo, paciente: ciclo.receta.paciente ? { id: ciclo.receta.paciente.id, rut: ciclo.receta.paciente.rut, nombre: ciclo.receta.paciente.nombre } : null }
      : undefined,
    numeroCiclo: ciclo.numeroCiclo,
    fechaProgramada: ciclo.fechaProgramada,
    horaInicio: ciclo.horaInicio,
    horaTermino: ciclo.horaTermino,
    sillonId: ciclo.sillonId,
    sillon: ciclo.sillon ? { id: ciclo.sillon.id, nombre: ciclo.sillon.nombre } : null,
    duracionEstimadaMin: ciclo.duracionEstimadaMin,
    estado: ciclo.estado,
    estadoLabel: ESTADO_CICLO_LABELS[ciclo.estado] ?? ciclo.estado,
    preparadoPor: ciclo.preparadoPor ? { id: ciclo.preparadoPor.id, name: ciclo.preparadoPor.name } : null,
    fechaPreparacion: ciclo.fechaPreparacion,
    administradoPor: ciclo.administradoPor ? { id: ciclo.administradoPor.id, name: ciclo.administradoPor.name } : null,
    fechaInicioReal: ciclo.fechaInicioReal,
    fechaTerminoReal: ciclo.fechaTerminoReal,
    reaccionAdversa: ciclo.reaccionAdversa,
    observaciones: ciclo.observaciones,
    motivoSuspension: ciclo.motivoSuspension,
    // Preparación (Químico Farmacéutico): trazabilidad de lote + volúmenes + doble visado.
    lote: ciclo.lote,
    fechaCaducidadLote: ciclo.fechaCaducidadLote,
    laboratorio: ciclo.laboratorio,
    volumenDosisMl: ciclo.volumenDosisMl,
    volumenSueroMl: ciclo.volumenSueroMl,
    volumenFinalMl: ciclo.volumenFinalMl,
    volumenResidualMl: ciclo.volumenResidualMl,
    vistoBuenoFarmaceutico: ciclo.vistoBuenoFarmaceutico,
    vistoBuenoQuimico: ciclo.vistoBuenoQuimico,
    // Acceso vascular (administración).
    cateterTipo: ciclo.cateterTipo,
    instalacionCateter: ciclo.instalacionCateter,
    refluye: ciclo.refluye,
    perfunde: ciclo.perfunde,
    enfPunciona: ciclo.enfPunciona ? { id: ciclo.enfPunciona.id, name: ciclo.enfPunciona.name } : null,
    diasPuncionado: ciclo.diasPuncionado,
    createdAt: ciclo.createdAt,
    updatedAt: ciclo.updatedAt,
    historial: ciclo.historial
      ? ciclo.historial.map((h) => ({
          id: h.id,
          estado: h.estado,
          estadoLabel: ESTADO_CICLO_LABELS[h.estado] ?? h.estado,
          fecha: h.fecha,
          comentario: h.comentario,
          actor: h.actor ? { id: h.actor.id, name: h.actor.name } : null,
        }))
      : undefined,
  };
}

export function serializeSillon(sillon) {
  return { id: sillon.id, nombre: sillon.nombre, activo: sillon.activo };
}

export function serializeCodigoGes(c) {
  return {
    id: c.id,
    codigo: c.codigo,
    problemaSalud: c.problemaSalud,
    intervencionSanitaria: c.intervencionSanitaria,
    familia: c.familia,
    glosaTrazadora: c.glosaTrazadora,
    frecuencia: c.frecuencia,
    periodicidad: c.periodicidad,
    activo: c.activo,
  };
}

export function serializeCodigoPpv(c) {
  return {
    id: c.id,
    codigo: c.codigo,
    familia: c.familia,
    glosaTrazadora: c.glosaTrazadora,
    intervencionSanitaria: c.intervencionSanitaria,
    activo: c.activo,
  };
}

// Arma la grilla sillón × día (rango [desde, hasta] inclusive) a partir de ciclos reales ya
// agendados — a diferencia de PabellonAllocation en agendas-repo (plantilla semanal sin
// fechas), acá cada celda corresponde a una fecha calendario real, con horario exacto (sin
// turno) igual que en PROGRAMACION del Excel de referencia.
export function construirGrilla(ciclos, sillones, desde, hasta) {
  const dias = [];
  const cursor = truncarFechaUTC(desde);
  const fin = truncarFechaUTC(hasta);
  while (cursor <= fin) {
    dias.push(new Date(cursor).toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const celdas = {};
  dias.forEach((dia) => {
    celdas[dia] = {};
    sillones.forEach((sillon) => {
      celdas[dia][sillon.id] = { ciclos: [] };
    });
  });

  ciclos.forEach((ciclo) => {
    if (!ciclo.sillonId) return;
    const diaKey = new Date(ciclo.fechaProgramada).toISOString().slice(0, 10);
    const celda = celdas[diaKey]?.[ciclo.sillonId];
    if (!celda) return;
    celda.ciclos.push(serializeCiclo(ciclo));
  });

  return { dias, sillones: sillones.map(serializeSillon), celdas };
}
