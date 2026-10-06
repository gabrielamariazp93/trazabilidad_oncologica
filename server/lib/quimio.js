// Módulo de Quimioterapia: receta -> validación/preparación de farmacia -> agenda de sillón ->
// administración -> estadística. Independiente de CasoOncologico (comparte solo Paciente).
// Mismo patrón arquitectónico que casos.js: entidad + historial de transiciones de estado.

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

export const TURNOS = ['Mañana', 'Tarde'];

// Ventana horaria aproximada por turno (la agenda no trae hora exacta, igual que
// VENTANA_JORNADA en agendas-repo) — se usa solo para estimar minutos disponibles en la grilla.
export const VENTANA_TURNO = {
  Mañana: { inicioMin: 8 * 60, finMin: 13 * 60 },
  Tarde: { inicioMin: 14 * 60, finMin: 18 * 60 },
};

// Catálogo de transiciones válidas de CicloQuimio. `roles` son los roles (además de admin, que
// siempre puede) habilitados para ejecutar la acción — la validación de rol la hace el router
// leyendo esta misma tabla, así la autorización vive junto a la máquina de estados.
export const ACCIONES_CICLO = {
  iniciar_preparacion: { desde: ['programado'], hacia: 'en_preparacion', roles: ['farmacia'] },
  marcar_listo: { desde: ['en_preparacion'], hacia: 'listo_para_administrar', roles: ['farmacia'] },
  iniciar_administracion: { desde: ['listo_para_administrar'], hacia: 'en_administracion', roles: ['enfermera_quimio'] },
  finalizar_administracion: { desde: ['en_administracion'], hacia: 'administrado', roles: ['enfermera_quimio'] },
  suspender: {
    desde: ['programado', 'en_preparacion', 'listo_para_administrar', 'en_administracion'],
    hacia: 'suspendido',
    roles: ['oncologo', 'farmacia', 'enfermera_quimio'],
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
export async function aplicarTransicionCiclo(tx, { ciclo, accion, actorUserId, comentario, fecha, observaciones, reaccionAdversa }) {
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
  if (accion === 'marcar_listo') data.fechaPreparacion = ahora;
  if (accion === 'iniciar_administracion') {
    data.administradoPorUserId = actorUserId ?? null;
    data.fechaInicioReal = ahora;
  }
  if (accion === 'finalizar_administracion') {
    data.fechaTerminoReal = ahora;
    if (observaciones !== undefined) data.observaciones = observaciones;
    if (reaccionAdversa !== undefined) data.reaccionAdversa = !!reaccionAdversa;
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
    farmaco: d.farmaco,
    dosis: d.dosis,
    unidad: d.unidad,
    via: d.via,
    duracionInfusionMin: d.duracionInfusionMin,
    orden: d.orden,
  };
}

export function serializeReceta(receta) {
  return {
    id: receta.id,
    pacienteId: receta.pacienteId,
    paciente: receta.paciente ? { id: receta.paciente.id, rut: receta.paciente.rut, nombre: receta.paciente.nombre } : null,
    medico: receta.medico ? { id: receta.medico.id, name: receta.medico.name } : null,
    protocolo: receta.protocolo,
    indicacion: receta.indicacion,
    numeroCiclosTotal: receta.numeroCiclosTotal,
    intervaloDias: receta.intervaloDias,
    superficieCorporal: receta.superficieCorporal,
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
    turno: ciclo.turno,
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

// Arma la grilla sillón × turno × día (rango [desde, hasta] inclusive) a partir de ciclos reales
// ya agendados — a diferencia de PabellonAllocation en agendas-repo (plantilla semanal sin
// fechas), acá cada celda corresponde a una fecha calendario real.
export function construirGrilla(ciclos, sillones, desde, hasta) {
  const dias = [];
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(0, 0, 0, 0);
  while (cursor <= fin) {
    dias.push(new Date(cursor).toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  const celdas = {};
  dias.forEach((dia) => {
    celdas[dia] = {};
    TURNOS.forEach((turno) => {
      celdas[dia][turno] = {};
      sillones.forEach((sillon) => {
        const ventana = VENTANA_TURNO[turno];
        celdas[dia][turno][sillon.id] = { minutosDisponibles: ventana.finMin - ventana.inicioMin, minutosOcupados: 0, ciclos: [] };
      });
    });
  });

  ciclos.forEach((ciclo) => {
    if (!ciclo.sillonId) return;
    const diaKey = new Date(ciclo.fechaProgramada).toISOString().slice(0, 10);
    const celda = celdas[diaKey]?.[ciclo.turno]?.[ciclo.sillonId];
    if (!celda) return;
    celda.minutosOcupados += ciclo.duracionEstimadaMin;
    celda.ciclos.push(serializeCiclo(ciclo));
  });

  return { dias, turnos: TURNOS, sillones: sillones.map(serializeSillon), celdas };
}
