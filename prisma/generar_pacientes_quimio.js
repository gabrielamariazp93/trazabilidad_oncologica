// Script de generación de datos sintéticos para pruebas del módulo de Quimioterapia.
// NO es parte de prisma/seed.js (que siembra la base mínima idempotente) — este script agrega
// datos aleatorios de más volumen encima, pensado para poder correrse cuando se necesite más
// carga de prueba. Se puede correr varias veces: cada corrida agrega 50 pacientes NUEVOS (RUTs
// sintéticos en el rango 900000001+, que no chocan con los RUTs demo existentes).
//
// Qué hace, en orden:
//   1. Limpia TODO el calendario de sillones (borra todos los CicloQuimio existentes, de
//      cualquier receta) — se agenda manualmente desde la plataforma de ahí en adelante.
//   2. Genera 50 pacientes nuevos con CasoOncologico en fase "tratamiento", vía de tratamiento
//      aleatoria mayoritariamente concentrada en quimioterapia (65%).
//   3. A un porcentaje de los pacientes con vía quimioterapia (60%) les genera una RecetaQuimio
//      con un esquema real aleatorio del catálogo de 86 esquemas, respetando su número de
//      ciclos/intervalo/fármacos reales — sin agendar ningún ciclo.
//   4. Todas las fechas (creación, validación) quedan en enero-marzo de 2027 — 2026 queda de lado.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/lib/auth.js';

const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10000, timeout: 20000 },
});

const N_PACIENTES = 50;
const PCT_VIA_QUIMIO = 0.65;
const PCT_CON_RECETA = 0.6;
const PCT_RECETA_VALIDADA = 0.7;

const NOMBRES = [
  'María', 'José', 'Juan', 'Rosa', 'Carmen', 'Luis', 'Ana', 'Pedro', 'Marta', 'Jorge',
  'Patricia', 'Carlos', 'Francisca', 'Manuel', 'Verónica', 'Sergio', 'Claudia', 'Raúl', 'Paola', 'Eduardo',
  'Gloria', 'Ricardo', 'Isabel', 'Fernando', 'Soledad', 'Mario', 'Pamela', 'Héctor', 'Daniela', 'Alejandro',
];
const APELLIDOS = [
  'González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda',
  'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela',
  'Castro', 'Vera', 'Gómez', 'Vásquez', 'Bravo', 'Reyes', 'Carrasco', 'Tapia', 'Pizarro', 'Rivas',
];

const PATOLOGIAS = [
  'Cáncer de mama', 'Cáncer colorrectal', 'Cáncer gástrico', 'Cáncer de pulmón',
  'Linfoma no Hodgkin', 'Cáncer de próstata', 'Cáncer de ovario', 'Cáncer de páncreas',
  'Cáncer de vejiga', 'Cáncer renal', 'Leucemia', 'Cáncer de cuello uterino',
  'Cáncer de tiroides', 'Sarcoma de partes blandas', 'Cáncer de esófago',
];

const VIAS_TRATAMIENTO = ['quirurgico', 'quimioterapia', 'radioterapia', 'mixto', 'ambulatorio'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function viaTratamientoAleatoria() {
  if (Math.random() < PCT_VIA_QUIMIO) return 'quimioterapia';
  return pick(VIAS_TRATAMIENTO.filter((v) => v !== 'quimioterapia'));
}

// Fecha aleatoria dentro de enero-marzo 2027 (UTC medianoche, consistente con el resto del
// módulo de quimio que usa fechas UTC-truncadas).
function fechaAleatoria2027() {
  const dia = Math.floor(Math.random() * 89); // 0..88 -> 1 ene..30 mar 2027
  return new Date(Date.UTC(2027, 0, 1 + dia));
}

function nombreAleatorio() {
  return `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
}

async function main() {
  console.log('--- Limpiando calendario de sillones (todos los CicloQuimio) ---');
  const borrados = await prisma.cicloQuimio.deleteMany({});
  console.log(`Ciclos borrados: ${borrados.count}`);

  const esquemasData = JSON.parse(
    (await import('fs')).readFileSync(new URL('./data/esquemas.json', import.meta.url), 'utf-8'),
  );
  const nombresEsquemas = Object.keys(esquemasData);

  const enfermeraOncologia = await prisma.user.findFirst({ where: { role: 'enfermera_oncologia' } });
  const oncologo = await prisma.user.findFirst({ where: { role: 'oncologo' } });

  // RUTs sintéticos en un rango que no choca con los RUTs demo existentes (111111111..666666666).
  const ultimoPaciente = await prisma.paciente.findFirst({
    where: { rut: { startsWith: '9' } },
    orderBy: { rut: 'desc' },
  });
  let siguienteRut = ultimoPaciente ? Number(ultimoPaciente.rut) + 1 : 900000001;

  console.log(`--- Generando ${N_PACIENTES} pacientes nuevos (RUT desde ${siguienteRut}) ---`);

  let conVia = 0;
  let conReceta = 0;

  for (let i = 0; i < N_PACIENTES; i++) {
    const rut = String(siguienteRut++);
    const nombre = nombreAleatorio();
    const via = viaTratamientoAleatoria();
    if (via === 'quimioterapia') conVia++;

    const paciente = await prisma.paciente.create({
      data: { rut, nombre, sexo: pick(['F', 'M']) },
    });

    const fechaIngreso = fechaAleatoria2027();
    await prisma.casoOncologico.create({
      data: {
        pacienteId: paciente.id,
        patologiaSospecha: pick(PATOLOGIAS),
        fase: 'tratamiento',
        hito: 'en_tratamiento',
        estado: 'activo',
        viaTratamiento: via,
        gestorUserId: null,
        createdAt: fechaIngreso,
        updatedAt: fechaIngreso,
      },
    });

    if (via === 'quimioterapia' && Math.random() < PCT_CON_RECETA) {
      const nombreEsquema = pick(nombresEsquemas);
      const lineas = esquemasData[nombreEsquema];
      const lineaConCiclos = lineas.find((l) => /^\d+$/.test(String(l.nCicloCalculado))) ?? lineas[0];
      const numeroCiclosTotal = /^\d+$/.test(String(lineaConCiclos.nCicloCalculado)) ? Number(lineaConCiclos.nCicloCalculado) : 4;
      const intervaloDias = lineaConCiclos.freqEntreCiclos || 21;

      const esquema = await prisma.esquemaQuimio.findUnique({ where: { nombre: nombreEsquema } });
      const valida = Math.random() < PCT_RECETA_VALIDADA;
      const fechaCreacion = fechaAleatoria2027();

      const farmacosQuimio = lineas.map((l, idx) => ({
        categoria: 'quimioterapia',
        farmaco: l.droga,
        dosis: String(Math.round(50 + Math.random() * 550)),
        unidad: 'mg/m2',
        via: 'EV',
        nSesion: l.nSesion,
        clasificacion: Math.random() < 0.5 ? 'LRS' : 'DAC',
        duracionInfusionMin: l.horasSillon ? Math.round(l.horasSillon * 60) : 60,
        orden: idx,
      }));
      const farmacosPremedicacion = [
        { categoria: 'premedicacion', farmaco: 'Dexametasona', dosis: '8', unidad: 'mg', via: 'VO', frecuencia: 'cada 12 h, desde día -1 hasta día 2', orden: farmacosQuimio.length },
        { categoria: 'premedicacion', farmaco: 'Ondansetron', dosis: '8', unidad: 'mg', via: 'EV', frecuencia: '30 min antes de la quimioterapia', orden: farmacosQuimio.length + 1 },
      ];

      await prisma.recetaQuimio.create({
        data: {
          pacienteId: paciente.id,
          medicoUserId: oncologo?.id ?? null,
          esquemaId: esquema?.id ?? null,
          protocolo: nombreEsquema,
          diagnostico: pick(PATOLOGIAS),
          intencion: pick(['curativa', 'neoadyuvante', 'adyuvante', 'paliativa']),
          riesgoEmetico: pick(['minimo', 'bajo', 'moderado', 'alto']),
          numeroCiclosTotal,
          intervaloDias,
          estado: valida ? 'validada' : 'borrador',
          farmaciaUserId: valida ? (enfermeraOncologia?.id ?? null) : null,
          fechaValidacion: valida ? fechaCreacion : null,
          createdAt: fechaCreacion,
          updatedAt: fechaCreacion,
          farmacos: { create: [...farmacosQuimio, ...farmacosPremedicacion] },
        },
      });
      conReceta++;
    }
  }

  console.log(`Listo: ${N_PACIENTES} pacientes nuevos, ${conVia} con vía quimioterapia, ${conReceta} con receta generada.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
