// Agenda y "administra" ciclos para un puñado de recetas de quimio validadas, respetando la
// disponibilidad real del calendario (misma lógica de colisión que usa el backend), con el único
// fin de dejar datos de prueba para ver la pantalla de Estadísticas (que solo cuenta ciclos en
// estado "administrado"). No es parte del seed base — se corre a mano cuando se necesite.
import { PrismaClient } from '@prisma/client';
import {
  resolverConfigDia,
  calcularBloquesLibres,
  sumarMinutos,
  truncarFechaUTC,
  seSuperponen,
} from '../server/lib/quimio.js';

const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10000, timeout: 20000 },
});

const N_PACIENTES = 5;
// Ventana de fechas para las sesiones "administradas" — dentro del rango enero-marzo 2027 que ya
// usan las recetas generadas (no se usa 2026). Ojo: para verlas en la pantalla de Estadísticas
// hay que ajustar el filtro "Desde/Hasta" a este mismo rango (el default de esa pantalla son los
// últimos 30 días reales).
const DESDE = Date.UTC(2027, 0, 4); // 2027-01-04 (lunes hábil)
const HASTA = Date.UTC(2027, 2, 15); // 2027-03-15

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fechaAleatoriaEnRango() {
  const dias = Math.floor((HASTA - DESDE) / 86400000);
  return new Date(DESDE + Math.floor(Math.random() * dias) * 86400000);
}

function duracionSugeridaReceta(receta) {
  const minutosQuimio = (receta.farmacos ?? [])
    .filter((f) => f.categoria === 'quimioterapia' && f.duracionInfusionMin)
    .reduce((sum, f) => sum + f.duracionInfusionMin, 0);
  return minutosQuimio > 0 ? minutosQuimio + 30 : 180;
}

async function main() {
  const [recetasCandidatas, sillones, diasHabiles, quimicoFarmaceutico, enfermeraQuimio] = await Promise.all([
    prisma.recetaQuimio.findMany({
      where: { estado: 'validada' },
      include: { ciclos: true, paciente: true, farmacos: true },
    }),
    prisma.sillon.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.diaHabilQuimio.findMany({ where: { fecha: { gte: new Date(DESDE), lte: new Date(HASTA) }, habil: true } }),
    prisma.user.findFirst({ where: { role: 'quimico_farmaceutico' } }),
    prisma.user.findFirst({ where: { role: 'enfermera_quimio' } }),
  ]);

  const candidatas = recetasCandidatas.filter((r) => r.ciclos.length === 0);
  if (candidatas.length < N_PACIENTES) {
    console.log(`Advertencia: solo hay ${candidatas.length} recetas validadas sin ciclos (se usarán todas).`);
  }
  // Mezcla aleatoria y toma las primeras N.
  const elegidas = candidatas.sort(() => Math.random() - 0.5).slice(0, N_PACIENTES);

  const diasHabilesPorFecha = new Map(diasHabiles.map((d) => [d.fecha.toISOString().slice(0, 10), d]));
  const ocupacion = []; // { fechaKey, sillonId, horaInicio, horaTermino } — propias + ya existentes en la BD

  const existentes = await prisma.cicloQuimio.findMany({ where: { estado: { notIn: ['cancelado'] } } });
  existentes.forEach((c) => {
    ocupacion.push({
      fechaKey: truncarFechaUTC(c.fechaProgramada).toISOString().slice(0, 10),
      sillonId: c.sillonId,
      horaInicio: c.horaInicio,
      horaTermino: c.horaTermino,
    });
  });

  let agendados = 0;

  for (const receta of elegidas) {
    const duracionMin = duracionSugeridaReceta(receta);

    // Hasta 60 intentos de fecha aleatoria hábil con cupo en algún sillón.
    let creado = false;
    for (let intento = 0; intento < 60 && !creado; intento++) {
      const fecha = fechaAleatoriaEnRango();
      const fechaKey = fecha.toISOString().slice(0, 10);
      const diaRow = diasHabilesPorFecha.get(fechaKey);
      if (!diaRow) continue; // no hábil o fuera del catálogo 2027
      const configDia = resolverConfigDia(diaRow, fecha);

      const sillonesBarajados = [...sillones].sort(() => Math.random() - 0.5);
      for (const sillon of sillonesBarajados) {
        const ocupadosDia = ocupacion.filter((o) => o.fechaKey === fechaKey && o.sillonId === sillon.id);
        const libres = calcularBloquesLibres(configDia, ocupadosDia, duracionMin);
        if (!libres.length) continue;
        const horaInicio = pick(libres);
        const horaTermino = sumarMinutos(horaInicio, duracionMin);

        const fechaInicioReal = new Date(`${fechaKey}T${horaInicio}:00.000Z`);
        const fechaTerminoReal = new Date(`${fechaKey}T${horaTermino}:00.000Z`);
        const fechaPreparacion = new Date(fechaInicioReal.getTime() - 45 * 60000);

        const ciclo = await prisma.cicloQuimio.create({
          data: {
            recetaId: receta.id,
            numeroCiclo: 1,
            fechaProgramada: fecha,
            horaInicio,
            horaTermino,
            sillonId: sillon.id,
            duracionEstimadaMin: duracionMin,
            estado: 'administrado',
            preparadoPorUserId: quimicoFarmaceutico?.id ?? null,
            fechaPreparacion,
            administradoPorUserId: enfermeraQuimio?.id ?? null,
            fechaInicioReal,
            fechaTerminoReal,
            reaccionAdversa: Math.random() < 0.1,
          },
        });
        await prisma.historialCiclo.createMany({
          data: [
            { cicloId: ciclo.id, estado: 'programado', fecha: fechaPreparacion, actorUserId: enfermeraQuimio?.id ?? null, comentario: 'Ciclo agendado.' },
            { cicloId: ciclo.id, estado: 'en_preparacion', fecha: fechaPreparacion, actorUserId: quimicoFarmaceutico?.id ?? null },
            { cicloId: ciclo.id, estado: 'listo_para_administrar', fecha: fechaInicioReal, actorUserId: quimicoFarmaceutico?.id ?? null },
            { cicloId: ciclo.id, estado: 'en_administracion', fecha: fechaInicioReal, actorUserId: enfermeraQuimio?.id ?? null },
            { cicloId: ciclo.id, estado: 'administrado', fecha: fechaTerminoReal, actorUserId: enfermeraQuimio?.id ?? null, comentario: 'Tolerancia adecuada, sin reacciones adversas.' },
          ],
        });

        ocupacion.push({ fechaKey, sillonId: sillon.id, horaInicio, horaTermino });
        console.log(`${receta.paciente.nombre} — ${receta.protocolo} — ${fechaKey} ${horaInicio}-${horaTermino} · ${sillon.nombre}`);
        agendados++;
        creado = true;
        break;
      }
    }
    if (!creado) console.log(`No se encontró cupo aleatorio para ${receta.paciente.nombre} (${receta.protocolo}) tras 60 intentos.`);
  }

  console.log(`Listo: ${agendados} ciclo(s) administrado(s) de prueba, entre ${new Date(DESDE).toISOString().slice(0,10)} y ${new Date(HASTA).toISOString().slice(0,10)}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
