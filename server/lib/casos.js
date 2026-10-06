// Catálogo de fases e hitos, curado a partir del levantamiento BPMN del flujo oncológico
// (Proceso oncológico 03082026v7 — Cirugía Mama, estructuralmente igual a v6 Coloproctología).
// No se modela cada tarea administrativa del BPMN (>50 pasos): se modela el avance
// clínico/administrativo relevante para trazabilidad, no el detalle operativo de cada área.

export const ROLE_LABELS = {
  admin: 'Administrador',
  gestor_oncologico: 'Gestor Oncológico',
  enfermera_policlinico: 'Enfermera de Policlínico',
  admision: 'Admisión',
  ges: 'GES',
  oncologo: 'Médico Oncólogo',
  farmacia: 'Farmacia',
  enfermera_quimio: 'Enfermera de Quimioterapia',
  lectura: 'Lectura',
};

export const FASES = ['sospecha', 'diagnostico_etapificacion', 'tratamiento', 'seguimiento'];

export const FASE_LABELS = {
  sospecha: 'Sospecha',
  diagnostico_etapificacion: 'Diagnóstico y Etapificación',
  tratamiento: 'Tratamiento',
  seguimiento: 'Seguimiento',
};

export const HITOS_POR_FASE = {
  sospecha: [
    { id: 'ingreso_ic_ges', label: 'Ingreso por IC / Garantía GES' },
    { id: 'en_estudio', label: 'En estudio (CNE / endoscopía / exámenes)' },
    { id: 'confirmacion_pendiente', label: 'Pendiente confirmación diagnóstica' },
  ],
  diagnostico_etapificacion: [
    { id: 'confirmacion_diagnostica', label: 'Confirmación diagnóstica (IPD)' },
    { id: 'preparacion_comite', label: 'Preparación de caso para Comité' },
    { id: 'presentado_comite', label: 'Presentado en Comité Oncológico' },
    { id: 'etapificado', label: 'Etapificación registrada' },
  ],
  tratamiento: [
    { id: 'decision_tratamiento', label: 'Decisión de tratamiento' },
    { id: 'en_tratamiento', label: 'En tratamiento (quirúrgico / quimioterapia / radioterapia)' },
    { id: 'control_post_tratamiento', label: 'Control post-tratamiento' },
  ],
  seguimiento: [
    { id: 'en_controles', label: 'En controles de seguimiento' },
    { id: 'alta_oncologica', label: 'Alta oncológica' },
  ],
};

export const TODOS_LOS_HITOS = Object.values(HITOS_POR_FASE).flat();

export function faseDeHito(hitoId) {
  return FASES.find((fase) => HITOS_POR_FASE[fase].some((h) => h.id === hitoId)) ?? null;
}

export const VIAS_TRATAMIENTO = [
  { id: 'quirurgico', label: 'Quirúrgico' },
  { id: 'quimioterapia', label: 'Quimioterapia' },
  { id: 'radioterapia', label: 'Radioterapia' },
  { id: 'mixto', label: 'Mixto' },
  { id: 'ambulatorio', label: 'Ambulatorio' },
];

export const MOTIVOS_CIERRE = [
  { id: 'descartado', label: 'Descartado (GES)' },
  { id: 'alta_oncologica', label: 'Alta oncológica' },
  { id: 'derivado_aps', label: 'Derivado a APS' },
  { id: 'derivado_externo', label: 'Derivado a otro establecimiento' },
  { id: 'fallecido', label: 'Fallecido' },
  { id: 'abandono', label: 'Abandono de tratamiento' },
];

export const TIPOS_DERIVACION = [
  { id: 'examen', label: 'Examen' },
  { id: 'interconsulta', label: 'Interconsulta / especialidad' },
  { id: 'centro_externo', label: 'Centro externo' },
  { id: 'radioterapia', label: 'Radioterapia' },
  { id: 'aps', label: 'APS' },
  { id: 'hospital_externo', label: 'Otro establecimiento' },
];

export const TIPOS_PLAZO = ['confirmacion_diagnostica', 'etapificacion', 'inicio_tratamiento', 'seguimiento'];

export const TIPO_PLAZO_LABELS = {
  confirmacion_diagnostica: 'Confirmación diagnóstica',
  etapificacion: 'Etapificación',
  inicio_tratamiento: 'Inicio de tratamiento',
  seguimiento: 'Seguimiento',
};

// Valores por defecto SOLO de referencia para poblar la demo — no son un dato legal real.
// El admin debe ajustarlos en /api/plazos/config según la normativa GES vigente para cada
// patología.
export const PLAZO_CONFIG_DEFAULT = {
  confirmacion_diagnostica: 20,
  etapificacion: 15,
  inicio_tratamiento: 30,
  seguimiento: 30,
};

// Cada plazo GES nace cuando el caso llega a `hitoInicio` (fechaInicio = fecha de ese hito) y
// se marca cumplido cuando el caso llega a `hitoCumplimiento`. Refleja los 4 "Registro Garantía
// GES ..." del BPMN, que siempre aparecen entre el cierre de una fase y el arranque de la
// siguiente.
export const PLAZO_TRIGGERS = [
  { tipo: 'confirmacion_diagnostica', hitoInicio: 'ingreso_ic_ges', hitoCumplimiento: 'confirmacion_diagnostica' },
  { tipo: 'etapificacion', hitoInicio: 'confirmacion_diagnostica', hitoCumplimiento: 'etapificado' },
  { tipo: 'inicio_tratamiento', hitoInicio: 'etapificado', hitoCumplimiento: 'en_tratamiento' },
  { tipo: 'seguimiento', hitoInicio: 'control_post_tratamiento', hitoCumplimiento: 'en_controles' },
];

const DIA_MS = 24 * 60 * 60 * 1000;

export function semaforoPlazo(plazo, now = new Date()) {
  if (plazo.fechaCumplimiento) {
    return new Date(plazo.fechaCumplimiento) > new Date(plazo.fechaLimite) ? 'cumplido_atrasado' : 'cumplido';
  }
  const diasRestantes = Math.ceil((new Date(plazo.fechaLimite).getTime() - now.getTime()) / DIA_MS);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= 5) return 'proximo';
  return 'vigente';
}

export function diasRestantesPlazo(plazo, now = new Date()) {
  return Math.ceil((new Date(plazo.fechaLimite).getTime() - now.getTime()) / DIA_MS);
}

// Aplica un nuevo hito a un caso: crea el HitoCaso, actualiza fase/hito del caso, y abre/cierra
// los PlazoGes que correspondan según PLAZO_TRIGGERS. Se ejecuta dentro de una transacción de
// Prisma (tx) para que historial + plazo + caso queden consistentes.
export async function aplicarHito(tx, { caso, hitoId, actorUserId, comentario, fecha, plazoConfigByTipo }) {
  const fase = faseDeHito(hitoId);
  if (!fase) throw new Error(`Hito desconocido: ${hitoId}`);

  const fechaHito = fecha ? new Date(fecha) : new Date();

  await tx.hitoCaso.create({
    data: {
      casoId: caso.id,
      fase,
      hito: hitoId,
      fecha: fechaHito,
      actorUserId: actorUserId ?? null,
      comentario: comentario ?? null,
    },
  });

  await tx.casoOncologico.update({
    where: { id: caso.id },
    data: { fase, hito: hitoId },
  });

  for (const trigger of PLAZO_TRIGGERS) {
    if (trigger.hitoInicio === hitoId) {
      const dias = plazoConfigByTipo?.[trigger.tipo] ?? PLAZO_CONFIG_DEFAULT[trigger.tipo];
      const fechaLimite = new Date(fechaHito.getTime() + dias * DIA_MS);
      await tx.plazoGes.create({
        data: {
          casoId: caso.id,
          tipo: trigger.tipo,
          fechaInicio: fechaHito,
          diasPlazo: dias,
          fechaLimite,
        },
      });
    }
    if (trigger.hitoCumplimiento === hitoId) {
      const plazoPendiente = await tx.plazoGes.findFirst({
        where: { casoId: caso.id, tipo: trigger.tipo, fechaCumplimiento: null },
        orderBy: { createdAt: 'desc' },
      });
      if (plazoPendiente) {
        await tx.plazoGes.update({
          where: { id: plazoPendiente.id },
          data: { fechaCumplimiento: fechaHito, estado: 'cumplido' },
        });
      }
    }
  }
}

// Recorre los plazos pendientes y genera notificaciones (una sola vez por umbral: 15/5/0 días,
// mismo patrón que las alertas de vigencia de Agenda en agendas-repo) para el destinatario
// gestor_oncologico. Se llama de forma perezosa (no hay cron) al listar casos/plazos.
export async function recalcularAlertas(prisma) {
  const now = new Date();
  const pendientes = await prisma.plazoGes.findMany({
    where: { fechaCumplimiento: null },
    include: { caso: { include: { paciente: true } } },
  });

  for (const plazo of pendientes) {
    const dias = diasRestantesPlazo(plazo, now);
    const label = TIPO_PLAZO_LABELS[plazo.tipo] ?? plazo.tipo;
    const nombre = plazo.caso?.paciente?.nombre ?? 'Paciente';

    const updates = {};
    if (dias <= 15 && !plazo.alerta15dEnviada) {
      updates.alerta15dEnviada = true;
      await prisma.notificacion.create({
        data: {
          casoId: plazo.casoId,
          destinationRole: 'gestor_oncologico',
          text: `${nombre}: plazo de ${label} vence en ${dias} día(s).`,
        },
      });
    }
    if (dias <= 5 && !plazo.alerta5dEnviada) {
      updates.alerta5dEnviada = true;
      await prisma.notificacion.create({
        data: {
          casoId: plazo.casoId,
          destinationRole: 'gestor_oncologico',
          text: `${nombre}: plazo de ${label} vence en ${dias} día(s) — urgente.`,
        },
      });
    }
    if (dias < 0 && !plazo.alerta0dEnviada) {
      updates.alerta0dEnviada = true;
      await prisma.notificacion.create({
        data: {
          casoId: plazo.casoId,
          destinationRole: 'gestor_oncologico',
          text: `${nombre}: plazo de ${label} está VENCIDO (hace ${Math.abs(dias)} día(s)).`,
        },
      });
    }
    if (Object.keys(updates).length) {
      await prisma.plazoGes.update({ where: { id: plazo.id }, data: updates });
    }
  }
}

export function serializePlazo(plazo) {
  return {
    id: plazo.id,
    tipo: plazo.tipo,
    label: TIPO_PLAZO_LABELS[plazo.tipo] ?? plazo.tipo,
    fechaInicio: plazo.fechaInicio,
    diasPlazo: plazo.diasPlazo,
    fechaLimite: plazo.fechaLimite,
    fechaCumplimiento: plazo.fechaCumplimiento,
    diasRestantes: diasRestantesPlazo(plazo),
    semaforo: semaforoPlazo(plazo),
  };
}

export function serializeHito(hito) {
  const catalogo = HITOS_POR_FASE[hito.fase]?.find((h) => h.id === hito.hito);
  return {
    id: hito.id,
    fase: hito.fase,
    faseLabel: FASE_LABELS[hito.fase] ?? hito.fase,
    hito: hito.hito,
    hitoLabel: catalogo?.label ?? hito.hito,
    fecha: hito.fecha,
    comentario: hito.comentario,
    actor: hito.actor ? { id: hito.actor.id, name: hito.actor.name, role: hito.actor.role, roleLabel: ROLE_LABELS[hito.actor.role] ?? hito.actor.role } : null,
  };
}

export function serializeNota(nota) {
  return {
    id: nota.id,
    texto: nota.texto,
    createdAt: nota.createdAt,
    autor: nota.autor
      ? { id: nota.autor.id, name: nota.autor.name, role: nota.autor.role, roleLabel: ROLE_LABELS[nota.autor.role] ?? nota.autor.role }
      : null,
  };
}

export function serializeCaso(caso) {
  const hitoActual = HITOS_POR_FASE[caso.fase]?.find((h) => h.id === caso.hito);
  return {
    id: caso.id,
    pacienteId: caso.pacienteId,
    paciente: caso.paciente
      ? { id: caso.paciente.id, rut: caso.paciente.rut, nombre: caso.paciente.nombre, origenOvalle: caso.paciente.origenOvalle }
      : null,
    patologiaSospecha: caso.patologiaSospecha,
    origenIngreso: caso.origenIngreso,
    fase: caso.fase,
    faseLabel: FASE_LABELS[caso.fase] ?? caso.fase,
    hito: caso.hito,
    hitoLabel: hitoActual?.label ?? caso.hito,
    estado: caso.estado,
    motivoCierre: caso.motivoCierre,
    fechaCierre: caso.fechaCierre,
    viaTratamiento: caso.viaTratamiento,
    gestor: caso.gestor ? { id: caso.gestor.id, name: caso.gestor.name, role: caso.gestor.role } : null,
    createdAt: caso.createdAt,
    updatedAt: caso.updatedAt,
    plazos: caso.plazos ? caso.plazos.map(serializePlazo) : undefined,
    hitos: caso.hitos ? caso.hitos.map(serializeHito) : undefined,
    notas: caso.notas ? caso.notas.map(serializeNota) : undefined,
    comites: caso.comites,
    derivaciones: caso.derivaciones,
    alerta: caso.plazos
      ? caso.plazos.some((p) => ['vencido', 'proximo'].includes(semaforoPlazo(p)))
      : undefined,
  };
}

export function normalizeRut(rut) {
  return String(rut ?? '')
    .toUpperCase()
    .replace(/[^0-9K]/g, '');
}
