import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/lib/auth.js';
import { PLAZO_CONFIG_DEFAULT, TIPO_PLAZO_LABELS, aplicarHito } from '../server/lib/casos.js';
import { sumarMinutos } from '../server/lib/quimio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function leerJsonData(nombre) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', nombre), 'utf-8'));
}

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000,
    timeout: 20000,
  },
});

const USERS = [
  { email: 'admin@hospital.local', name: 'Administradora DDI', role: 'admin' },
  { email: 'gestora@hospital.local', name: 'Paula Contreras (Gestora Oncológica)', role: 'gestor_oncologico' },
  { email: 'enfermera@hospital.local', name: 'Javiera Muñoz (Enfermera Policlínico)', role: 'enfermera_policlinico' },
  { email: 'admision@hospital.local', name: 'Equipo Admisión', role: 'admision' },
  { email: 'ges@hospital.local', name: 'Camila Soto (Encargada GES)', role: 'ges' },
  { email: 'oncologo@hospital.local', name: 'Dr. Felipe Rojas (Oncólogo)', role: 'oncologo' },
  { email: 'farmacia@hospital.local', name: 'Daniela Pizarro (Farmacia)', role: 'farmacia' },
  { email: 'enfermera.quimio@hospital.local', name: 'Cristina Vera (Enfermera Quimioterapia)', role: 'enfermera_quimio' },
  { email: 'lectura@hospital.local', name: 'Subdirección (solo lectura)', role: 'lectura' },
];

const DIA_MS = 24 * 60 * 60 * 1000;
function haceDias(n) {
  return new Date(Date.now() - n * DIA_MS);
}

async function avanzar(tx, caso, hitoId, actorUserId, fecha, comentario, plazoConfigByTipo) {
  await aplicarHito(tx, { caso, hitoId, actorUserId, comentario, fecha, plazoConfigByTipo });
  return tx.casoOncologico.findUniqueOrThrow({ where: { id: caso.id } });
}

async function main() {
  const passwordHash = hashPassword('demo123');

  const usersByRole = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    usersByRole[u.role] = user;
  }

  for (const tipo of Object.keys(PLAZO_CONFIG_DEFAULT)) {
    await prisma.plazoConfig.upsert({
      where: { tipo },
      update: {},
      create: { tipo, label: TIPO_PLAZO_LABELS[tipo], diasPlazoDefault: PLAZO_CONFIG_DEFAULT[tipo] },
    });
  }

  const gestora = usersByRole.gestor_oncologico;
  const enfermera = usersByRole.enfermera_policlinico;
  const plazoConfigByTipo = PLAZO_CONFIG_DEFAULT;

  // Limpia casos/pacientes demo previos para que el seed sea idempotente sin duplicar.
  await prisma.paciente.deleteMany({ where: { rut: { in: ['111111111', '222222222', '333333333', '444444444'] } } });

  // --- Caso A: recién ingresado, fase Sospecha ---
  const pacienteA = await prisma.paciente.create({
    data: { rut: '111111111', nombre: 'Ana Pérez', sexo: 'F', telefono: '+56911111111' },
  });
  await prisma.$transaction(async (tx) => {
    let caso = await tx.casoOncologico.create({
      data: { pacienteId: pacienteA.id, patologiaSospecha: 'Sospecha cáncer de mama', origenIngreso: 'IC', gestorUserId: gestora.id },
    });
    caso = await avanzar(tx, caso, 'ingreso_ic_ges', gestora.id, haceDias(10), 'Ingreso por interconsulta.', plazoConfigByTipo);
    await avanzar(tx, caso, 'en_estudio', enfermera.id, haceDias(6), 'Mamografía + biopsia core solicitadas.', plazoConfigByTipo);
    await tx.notaCaso.create({
      data: { casoId: caso.id, autorUserId: enfermera.id, texto: 'Paciente confirma hora de biopsia por teléfono. Avisar si hay cambios de horario.' },
    });
  });

  // --- Caso B: esperando presentación a Comité, fase Diagnóstico y Etapificación ---
  const pacienteB = await prisma.paciente.create({
    data: { rut: '222222222', nombre: 'Marta Soto', sexo: 'F', telefono: '+56922222222' },
  });
  await prisma.$transaction(async (tx) => {
    let caso = await tx.casoOncologico.create({
      data: { pacienteId: pacienteB.id, patologiaSospecha: 'Cáncer de mama', origenIngreso: 'GES', gestorUserId: gestora.id },
    });
    caso = await avanzar(tx, caso, 'ingreso_ic_ges', gestora.id, haceDias(35), 'Ingreso por Garantía GES.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'en_estudio', enfermera.id, haceDias(30), 'Biopsia realizada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'confirmacion_pendiente', enfermera.id, haceDias(20), 'Esperando resultado IPD.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'confirmacion_diagnostica', gestora.id, haceDias(14), 'IPD confirma diagnóstico.', plazoConfigByTipo);
    await avanzar(tx, caso, 'preparacion_comite', gestora.id, haceDias(3), 'Caso preparado para próximo Comité Oncológico.', plazoConfigByTipo);
    await tx.notaCaso.create({
      data: { casoId: caso.id, autorUserId: usersByRole.admision.id, texto: 'Paciente vive en zona rural, coordinar transporte para el día del Comité.' },
    });
    await tx.notaCaso.create({
      data: { casoId: caso.id, autorUserId: gestora.id, texto: 'Transporte coordinado con Admisión. Confirmado con la paciente por teléfono.' },
    });
  });

  // --- Caso C: en tratamiento (quimioterapia), fase Tratamiento ---
  const pacienteC = await prisma.paciente.create({
    data: { rut: '333333333', nombre: 'Carmen Rivas', sexo: 'F', telefono: '+56933333333' },
  });
  await prisma.$transaction(async (tx) => {
    let caso = await tx.casoOncologico.create({
      data: {
        pacienteId: pacienteC.id,
        patologiaSospecha: 'Cáncer de mama',
        origenIngreso: 'GES',
        gestorUserId: gestora.id,
        viaTratamiento: 'quimioterapia',
      },
    });
    caso = await avanzar(tx, caso, 'ingreso_ic_ges', gestora.id, haceDias(90), 'Ingreso por Garantía GES.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'en_estudio', enfermera.id, haceDias(85), 'Biopsia realizada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'confirmacion_diagnostica', gestora.id, haceDias(70), 'IPD confirma diagnóstico.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'presentado_comite', gestora.id, haceDias(60), 'Presentado en Comité Oncológico.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'etapificado', gestora.id, haceDias(55), 'Etapificación registrada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'decision_tratamiento', gestora.id, haceDias(40), 'Decisión: quimioterapia neoadyuvante.', plazoConfigByTipo);
    await avanzar(tx, caso, 'en_tratamiento', enfermera.id, haceDias(35), 'Inicio de ciclos de quimioterapia.', plazoConfigByTipo);
    await tx.notaCaso.create({
      data: { casoId: caso.id, autorUserId: usersByRole.ges.id, texto: 'Registro de Garantía GES de tratamiento cursado en plataforma ministerial.' },
    });
  });

  // --- Caso D: en controles de seguimiento, fase Seguimiento ---
  const pacienteD = await prisma.paciente.create({
    data: { rut: '444444444', nombre: 'Rosa Díaz', sexo: 'F', telefono: '+56944444444', origenOvalle: true },
  });
  await prisma.$transaction(async (tx) => {
    let caso = await tx.casoOncologico.create({
      data: { pacienteId: pacienteD.id, patologiaSospecha: 'Cáncer de mama', origenIngreso: 'GES', gestorUserId: gestora.id, viaTratamiento: 'quirurgico' },
    });
    caso = await avanzar(tx, caso, 'ingreso_ic_ges', gestora.id, haceDias(200), 'Ingreso por Garantía GES.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'en_estudio', enfermera.id, haceDias(195), 'Biopsia realizada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'confirmacion_diagnostica', gestora.id, haceDias(180), 'IPD confirma diagnóstico.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'presentado_comite', gestora.id, haceDias(170), 'Presentado en Comité Oncológico.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'etapificado', gestora.id, haceDias(165), 'Etapificación registrada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'decision_tratamiento', gestora.id, haceDias(150), 'Decisión: cirugía conservadora + radioterapia.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'en_tratamiento', enfermera.id, haceDias(140), 'Cirugía realizada.', plazoConfigByTipo);
    caso = await avanzar(tx, caso, 'control_post_tratamiento', gestora.id, haceDias(60), 'Control post-quirúrgico y post-radioterapia OK.', plazoConfigByTipo);
    await avanzar(tx, caso, 'en_controles', enfermera.id, haceDias(10), 'Primer control de seguimiento realizado.', plazoConfigByTipo);
  });

  // --- Quimioterapia: esquemas + calendario real + 16 sillones + 1 receta con 3 ciclos ---
  const oncologo = usersByRole.oncologo;
  const farmacia = usersByRole.farmacia;
  const enfermeraQuimio = usersByRole.enfermera_quimio;

  // Catálogo de esquemas (86 protocolos reales, extraídos de la base de trabajo en Excel de la
  // usuaria — prisma/data/esquemas.json). Idempotente: upsert por nombre de esquema.
  const esquemasData = leerJsonData('esquemas.json');
  const esquemasPorNombre = {};
  for (const [nombre, lineas] of Object.entries(esquemasData)) {
    const esquema = await prisma.esquemaQuimio.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    await prisma.esquemaFarmacoLinea.deleteMany({ where: { esquemaId: esquema.id } });
    await prisma.esquemaFarmacoLinea.createMany({
      data: lineas.map((l, idx) => ({
        esquemaId: esquema.id,
        droga: l.droga,
        nSesion: String(l.nSesion ?? ''),
        nCicloCalculado: String(l.nCicloCalculado ?? 1),
        freqEntreSesiones: l.freqEntreSesiones ?? 0,
        freqEntreCiclos: l.freqEntreCiclos ?? 0,
        horasSillon: l.horasSillon ?? 0,
        orden: idx,
      })),
    });
    esquemasPorNombre[nombre] = esquema;
  }

  // Calendario real 2027 (365 días, hábil/feriado/horario exactos — prisma/data/calendario_2027.json).
  const calendarioData = leerJsonData('calendario_2027.json');
  for (const dia of calendarioData) {
    await prisma.diaHabilQuimio.upsert({
      where: { fecha: new Date(dia.fecha) },
      update: { habil: dia.habil, feriado: dia.feriado, horaInicio: dia.horaInicio, horaFin: dia.horaFin },
      create: { fecha: new Date(dia.fecha), habil: dia.habil, feriado: dia.feriado, horaInicio: dia.horaInicio, horaFin: dia.horaFin },
    });
  }

  // 16 sillones reales (prisma/data/sillones.json). orden se extrae del número en el nombre
  // ("Sillón 10" -> 10) para que la grilla los muestre 1..16 y no alfabético (1,10,11..,2,3..).
  const sillonesData = leerJsonData('sillones.json');
  const sillones = [];
  for (const s of sillonesData) {
    const numero = Number(String(s.nombre).match(/\d+/)?.[0] ?? 0);
    const sillon = await prisma.sillon.upsert({
      where: { nombre: s.nombre },
      update: { activo: s.activo, orden: numero },
      create: { nombre: s.nombre, activo: s.activo, orden: numero },
    });
    sillones.push(sillon);
  }

  // Reusa a Carmen Rivas (pacienteC, ya en fase Tratamiento con viaTratamiento=quimioterapia en
  // su CasoOncologico) para que la demo cuente una historia coherente entre ambos módulos,
  // aunque el módulo de quimio es independiente y no depende de que exista ese caso.
  await prisma.recetaQuimio.deleteMany({ where: { paciente: { rut: '333333333' } } });
  const esquemaAC21 = esquemasPorNombre['AC-21'];
  const receta = await prisma.recetaQuimio.create({
    data: {
      pacienteId: pacienteC.id,
      medicoUserId: oncologo.id,
      esquemaId: esquemaAC21?.id ?? null,
      protocolo: 'AC-21',
      indicacion: 'Quimioterapia neoadyuvante, cáncer de mama.',
      diagnostico: 'Cáncer de mama',
      intencion: 'neoadyuvante',
      riesgoEmetico: 'alto',
      numeroCiclosTotal: 4,
      intervaloDias: 21,
      pesoKg: 64,
      tallaCm: 162,
      superficieCorporal: 1.68,
      otrasIndicaciones: 'Ondansetron 8 mg VO en caso de vómitos (máximo 32 mg/día). Loperamida 1 tableta cada 8 h si hay diarrea.',
      neupogenIndicado: true,
      neupogenDias: 'Días 3 a 7 post ciclo',
      estado: 'validada',
      farmaciaUserId: farmacia.id,
      fechaValidacion: haceDias(34),
      farmacos: {
        create: [
          { categoria: 'premedicacion', farmaco: 'Dexametasona', dosis: '8', unidad: 'mg', via: 'VO', frecuencia: 'cada 12 h, desde día -1 hasta día 2', orden: 0 },
          { categoria: 'premedicacion', farmaco: 'Clorfenamina', dosis: '10', unidad: 'mg', via: 'EV', frecuencia: '30 min antes de la quimioterapia', orden: 1 },
          { categoria: 'premedicacion', farmaco: 'Ondansetron', dosis: '8', unidad: 'mg', via: 'EV', frecuencia: '30 min antes de la quimioterapia (máx. 32 mg/día)', orden: 2 },
          { categoria: 'quimioterapia', farmaco: 'Doxorrubicina', dosis: '60', unidad: 'mg/m2', via: 'EV', nSesion: 'D1', duracionInfusionMin: 15, orden: 3 },
          { categoria: 'quimioterapia', farmaco: 'Ciclofosfamida', dosis: '600', unidad: 'mg/m2', via: 'EV', nSesion: 'D1', duracionInfusionMin: 30, orden: 4 },
          { categoria: 'rescate', farmaco: 'Metoclopramida', dosis: '10', unidad: 'mg', via: 'VO', frecuencia: 'en caso de náuseas', orden: 5 },
        ],
      },
    },
  });

  // Ciclo 1: administrado (hace 13 días), horario exacto en vez de turno.
  const ciclo1 = await prisma.cicloQuimio.create({
    data: {
      recetaId: receta.id,
      numeroCiclo: 1,
      fechaProgramada: haceDias(13),
      horaInicio: '09:15',
      horaTermino: sumarMinutos('09:15', 180),
      sillonId: sillones[0].id,
      duracionEstimadaMin: 180,
      estado: 'administrado',
      preparadoPorUserId: farmacia.id,
      fechaPreparacion: haceDias(13),
      administradoPorUserId: enfermeraQuimio.id,
      fechaInicioReal: haceDias(13),
      fechaTerminoReal: haceDias(13),
      observaciones: 'Tolerancia adecuada, sin reacciones adversas.',
    },
  });
  await prisma.historialCiclo.createMany({
    data: [
      { cicloId: ciclo1.id, estado: 'programado', fecha: haceDias(20), actorUserId: enfermeraQuimio.id, comentario: 'Ciclo agendado.' },
      { cicloId: ciclo1.id, estado: 'en_preparacion', fecha: haceDias(13), actorUserId: farmacia.id },
      { cicloId: ciclo1.id, estado: 'listo_para_administrar', fecha: haceDias(13), actorUserId: farmacia.id },
      { cicloId: ciclo1.id, estado: 'en_administracion', fecha: haceDias(13), actorUserId: enfermeraQuimio.id },
      { cicloId: ciclo1.id, estado: 'administrado', fecha: haceDias(13), actorUserId: enfermeraQuimio.id, comentario: 'Tolerancia adecuada, sin reacciones adversas.' },
    ],
  });

  // Ciclo 2: en preparación (hoy por la tarde) — farmacia ya está preparando los fármacos.
  const ciclo2 = await prisma.cicloQuimio.create({
    data: {
      recetaId: receta.id,
      numeroCiclo: 2,
      fechaProgramada: new Date(),
      horaInicio: '14:15',
      horaTermino: sumarMinutos('14:15', 180),
      sillonId: sillones[1].id,
      duracionEstimadaMin: 180,
      estado: 'en_preparacion',
      preparadoPorUserId: farmacia.id,
    },
  });
  await prisma.historialCiclo.createMany({
    data: [
      { cicloId: ciclo2.id, estado: 'programado', fecha: haceDias(5), actorUserId: enfermeraQuimio.id, comentario: 'Ciclo agendado.' },
      { cicloId: ciclo2.id, estado: 'en_preparacion', actorUserId: farmacia.id },
    ],
  });

  // Ciclo 3: programado a futuro, sin sillón asignado todavía.
  const ciclo3 = await prisma.cicloQuimio.create({
    data: {
      recetaId: receta.id,
      numeroCiclo: 3,
      fechaProgramada: new Date(Date.now() + 8 * DIA_MS),
      horaInicio: '09:45',
      horaTermino: sumarMinutos('09:45', 180),
      duracionEstimadaMin: 180,
      estado: 'programado',
    },
  });
  await prisma.historialCiclo.create({
    data: { cicloId: ciclo3.id, estado: 'programado', actorUserId: enfermeraQuimio.id, comentario: 'Ciclo agendado.' },
  });

  console.log(
    `Seed listo: ${USERS.length} usuarios demo, 4 casos de ejemplo (flujo Cirugía Mama), ` +
    `${Object.keys(esquemasPorNombre).length} esquemas de quimio, ${calendarioData.length} días de calendario, ` +
    `${sillones.length} sillones, 1 receta de quimio con 3 ciclos.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
