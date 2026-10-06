import express from 'express';
import {
  ACCIONES_CICLO,
  TURNOS,
  aplicarTransicionCiclo,
  calcularSuperficieCorporal,
  construirGrilla,
  rolPuedeAccion,
  serializeCiclo,
  serializeReceta,
  serializeSillon,
} from '../lib/quimio.js';

const RECETA_EDITOR_ROLES = ['oncologo', 'admin'];
const FARMACIA_ROLES = ['farmacia', 'admin'];
const AGENDA_ROLES = ['enfermera_quimio', 'admin'];

const RECETA_INCLUDE = {
  paciente: true,
  medico: true,
  farmaceutico: true,
  farmacos: { orderBy: { orden: 'asc' } },
  ciclos: { orderBy: { numeroCiclo: 'asc' }, include: { sillon: true } },
};

const CICLO_INCLUDE = {
  receta: { include: { paciente: true } },
  sillon: true,
  preparadoPor: true,
  administradoPor: true,
  historial: { orderBy: { fecha: 'asc' }, include: { actor: true } },
};

export function createQuimioRouter({ prisma, requireAuth, requireRoles }) {
  const router = express.Router();

  async function loadRecetaOr404(id, res) {
    const receta = await prisma.recetaQuimio.findUnique({ where: { id }, include: RECETA_INCLUDE });
    if (!receta) {
      res.status(404).json({ error: 'Receta no encontrada.' });
      return null;
    }
    return receta;
  }

  async function loadCicloOr404(id, res) {
    const ciclo = await prisma.cicloQuimio.findUnique({ where: { id }, include: CICLO_INCLUDE });
    if (!ciclo) {
      res.status(404).json({ error: 'Ciclo no encontrado.' });
      return null;
    }
    return ciclo;
  }

  // --- Sillones ------------------------------------------------------------

  router.get('/sillones', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const sillones = await prisma.sillon.findMany({ orderBy: { nombre: 'asc' } });
    res.json({ sillones: sillones.map(serializeSillon) });
  });

  router.post('/sillones', async (req, res) => {
    if (!requireRoles(req, res, ['admin'])) return;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre) {
      res.status(400).json({ error: 'nombre es obligatorio.' });
      return;
    }
    const sillon = await prisma.sillon.create({ data: { nombre } });
    res.status(201).json({ sillon: serializeSillon(sillon) });
  });

  router.patch('/sillones/:id', async (req, res) => {
    if (!requireRoles(req, res, ['admin'])) return;
    const data = {};
    if (typeof req.body?.nombre === 'string') data.nombre = req.body.nombre.trim();
    if (typeof req.body?.activo === 'boolean') data.activo = req.body.activo;
    const sillon = await prisma.sillon.update({ where: { id: req.params.id }, data });
    res.json({ sillon: serializeSillon(sillon) });
  });

  // --- Recetas ------------------------------------------------------------

  router.get('/quimio/recetas', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const where = {};
    if (typeof req.query.pacienteId === 'string' && req.query.pacienteId) where.pacienteId = req.query.pacienteId;
    if (typeof req.query.estado === 'string' && req.query.estado) where.estado = req.query.estado;
    const recetas = await prisma.recetaQuimio.findMany({ where, include: RECETA_INCLUDE, orderBy: { updatedAt: 'desc' } });
    res.json({ recetas: recetas.map(serializeReceta) });
  });

  function mapFarmacoInput(f, idx) {
    return {
      categoria: f.categoria ?? 'quimioterapia',
      farmaco: f.farmaco,
      dosis: String(f.dosis ?? ''),
      unidad: f.unidad ?? '',
      via: f.via ?? '',
      frecuencia: f.frecuencia ?? null,
      duracionInfusionMin: f.duracionInfusionMin ? Number(f.duracionInfusionMin) : null,
      orden: idx,
    };
  }

  router.post('/quimio/recetas', async (req, res) => {
    if (!requireRoles(req, res, RECETA_EDITOR_ROLES)) return;
    const {
      pacienteId, protocolo, indicacion, diagnostico, intencion, riesgoEmetico,
      numeroCiclosTotal, intervaloDias, pesoKg, tallaCm, superficieCorporal,
      otrasIndicaciones, neupogenIndicado, neupogenDias, farmacos,
    } = req.body ?? {};
    if (!pacienteId || !protocolo || !numeroCiclosTotal || !intervaloDias) {
      res.status(400).json({ error: 'pacienteId, protocolo, numeroCiclosTotal e intervaloDias son obligatorios.' });
      return;
    }
    const paciente = await prisma.paciente.findUnique({ where: { id: pacienteId } });
    if (!paciente) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    const sc = superficieCorporal ? Number(superficieCorporal) : calcularSuperficieCorporal(pesoKg ? Number(pesoKg) : null, tallaCm ? Number(tallaCm) : null);

    const receta = await prisma.recetaQuimio.create({
      data: {
        pacienteId,
        medicoUserId: req.authUser.id,
        protocolo,
        indicacion: indicacion ?? null,
        diagnostico: diagnostico ?? null,
        intencion: intencion ?? null,
        riesgoEmetico: riesgoEmetico ?? null,
        numeroCiclosTotal: Number(numeroCiclosTotal),
        intervaloDias: Number(intervaloDias),
        pesoKg: pesoKg ? Number(pesoKg) : null,
        tallaCm: tallaCm ? Number(tallaCm) : null,
        superficieCorporal: sc,
        otrasIndicaciones: otrasIndicaciones ?? null,
        neupogenIndicado: !!neupogenIndicado,
        neupogenDias: neupogenDias ?? null,
        farmacos: {
          create: Array.isArray(farmacos) ? farmacos.map(mapFarmacoInput) : [],
        },
      },
      include: RECETA_INCLUDE,
    });
    res.status(201).json({ receta: serializeReceta(receta) });
  });

  router.get('/quimio/recetas/:id', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    res.json({ receta: serializeReceta(receta) });
  });

  router.patch('/quimio/recetas/:id', async (req, res) => {
    if (!requireRoles(req, res, RECETA_EDITOR_ROLES)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    if (receta.estado !== 'borrador') {
      res.status(400).json({ error: 'Solo se puede editar una receta en borrador.' });
      return;
    }

    const {
      protocolo, indicacion, diagnostico, intencion, riesgoEmetico,
      numeroCiclosTotal, intervaloDias, pesoKg, tallaCm, superficieCorporal,
      otrasIndicaciones, neupogenIndicado, neupogenDias, farmacos,
    } = req.body ?? {};
    const data = {};
    if (protocolo !== undefined) data.protocolo = protocolo;
    if (indicacion !== undefined) data.indicacion = indicacion;
    if (diagnostico !== undefined) data.diagnostico = diagnostico;
    if (intencion !== undefined) data.intencion = intencion;
    if (riesgoEmetico !== undefined) data.riesgoEmetico = riesgoEmetico;
    if (numeroCiclosTotal !== undefined) data.numeroCiclosTotal = Number(numeroCiclosTotal);
    if (intervaloDias !== undefined) data.intervaloDias = Number(intervaloDias);
    if (pesoKg !== undefined) data.pesoKg = pesoKg ? Number(pesoKg) : null;
    if (tallaCm !== undefined) data.tallaCm = tallaCm ? Number(tallaCm) : null;
    if (superficieCorporal !== undefined) {
      data.superficieCorporal = superficieCorporal
        ? Number(superficieCorporal)
        : calcularSuperficieCorporal(data.pesoKg ?? receta.pesoKg, data.tallaCm ?? receta.tallaCm);
    }
    if (otrasIndicaciones !== undefined) data.otrasIndicaciones = otrasIndicaciones;
    if (neupogenIndicado !== undefined) data.neupogenIndicado = !!neupogenIndicado;
    if (neupogenDias !== undefined) data.neupogenDias = neupogenDias;

    await prisma.$transaction(async (tx) => {
      await tx.recetaQuimio.update({ where: { id: receta.id }, data });
      if (Array.isArray(farmacos)) {
        await tx.detalleRecetaFarmaco.deleteMany({ where: { recetaId: receta.id } });
        await tx.detalleRecetaFarmaco.createMany({
          data: farmacos.map((f, idx) => ({ recetaId: receta.id, ...mapFarmacoInput(f, idx) })),
        });
      }
    });

    const actualizada = await loadRecetaOr404(receta.id, res);
    if (!actualizada) return;
    res.json({ receta: serializeReceta(actualizada) });
  });

  router.post('/quimio/recetas/:id/validar', async (req, res) => {
    if (!requireRoles(req, res, FARMACIA_ROLES)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    if (receta.estado !== 'borrador') {
      res.status(400).json({ error: 'Solo se puede validar una receta en borrador.' });
      return;
    }
    if (!receta.farmacos.length) {
      res.status(400).json({ error: 'La receta no tiene fármacos indicados.' });
      return;
    }

    await prisma.recetaQuimio.update({
      where: { id: receta.id },
      data: {
        estado: 'validada',
        farmaciaUserId: req.authUser.id,
        fechaValidacion: new Date(),
        observacionesValidacion: req.body?.observaciones ?? null,
      },
    });
    const actualizada = await loadRecetaOr404(receta.id, res);
    if (!actualizada) return;
    res.json({ receta: serializeReceta(actualizada) });
  });

  router.post('/quimio/recetas/:id/rechazar', async (req, res) => {
    if (!requireRoles(req, res, FARMACIA_ROLES)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    if (receta.estado !== 'borrador') {
      res.status(400).json({ error: 'Solo se puede rechazar una receta en borrador.' });
      return;
    }
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
    if (!motivo) {
      res.status(400).json({ error: 'motivo es obligatorio.' });
      return;
    }

    await prisma.recetaQuimio.update({
      where: { id: receta.id },
      data: { estado: 'rechazada', farmaciaUserId: req.authUser.id, fechaValidacion: new Date(), observacionesValidacion: motivo },
    });
    const actualizada = await loadRecetaOr404(receta.id, res);
    if (!actualizada) return;
    res.json({ receta: serializeReceta(actualizada) });
  });

  // --- Ciclos ------------------------------------------------------------

  router.get('/quimio/ciclos', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const where = {};
    if (typeof req.query.estado === 'string' && req.query.estado) where.estado = req.query.estado;
    if (typeof req.query.sillonId === 'string' && req.query.sillonId) where.sillonId = req.query.sillonId;
    if (typeof req.query.recetaId === 'string' && req.query.recetaId) where.recetaId = req.query.recetaId;
    if (req.query.desde || req.query.hasta) {
      where.fechaProgramada = {};
      if (req.query.desde) where.fechaProgramada.gte = new Date(req.query.desde);
      if (req.query.hasta) where.fechaProgramada.lte = new Date(req.query.hasta);
    }
    const ciclos = await prisma.cicloQuimio.findMany({ where, include: CICLO_INCLUDE, orderBy: { fechaProgramada: 'asc' } });
    res.json({ ciclos: ciclos.map(serializeCiclo) });
  });

  router.post('/quimio/ciclos', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const { recetaId, numeroCiclo, fechaProgramada, turno, sillonId, duracionEstimadaMin } = req.body ?? {};
    if (!recetaId || !numeroCiclo || !fechaProgramada || !turno) {
      res.status(400).json({ error: 'recetaId, numeroCiclo, fechaProgramada y turno son obligatorios.' });
      return;
    }
    if (!TURNOS.includes(turno)) {
      res.status(400).json({ error: `turno debe ser uno de: ${TURNOS.join(', ')}.` });
      return;
    }
    const receta = await prisma.recetaQuimio.findUnique({ where: { id: recetaId } });
    if (!receta) {
      res.status(404).json({ error: 'Receta no encontrada.' });
      return;
    }
    if (receta.estado !== 'validada') {
      res.status(400).json({ error: 'Solo se pueden agendar ciclos de una receta validada.' });
      return;
    }

    const ciclo = await prisma.cicloQuimio.create({
      data: {
        recetaId,
        numeroCiclo: Number(numeroCiclo),
        fechaProgramada: new Date(fechaProgramada),
        turno,
        sillonId: sillonId ?? null,
        duracionEstimadaMin: duracionEstimadaMin ? Number(duracionEstimadaMin) : 180,
      },
      include: CICLO_INCLUDE,
    });
    await prisma.historialCiclo.create({ data: { cicloId: ciclo.id, estado: 'programado', actorUserId: req.authUser.id, comentario: 'Ciclo agendado.' } });
    const actualizado = await loadCicloOr404(ciclo.id, res);
    if (!actualizado) return;
    res.status(201).json({ ciclo: serializeCiclo(actualizado) });
  });

  router.get('/quimio/ciclos/:id', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ciclo = await loadCicloOr404(req.params.id, res);
    if (!ciclo) return;
    res.json({ ciclo: serializeCiclo(ciclo) });
  });

  router.patch('/quimio/ciclos/:id', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const ciclo = await loadCicloOr404(req.params.id, res);
    if (!ciclo) return;
    if (ciclo.estado !== 'programado') {
      res.status(400).json({ error: 'Solo se puede reagendar un ciclo en estado programado.' });
      return;
    }
    const { fechaProgramada, turno, sillonId, duracionEstimadaMin } = req.body ?? {};
    if (turno !== undefined && !TURNOS.includes(turno)) {
      res.status(400).json({ error: `turno debe ser uno de: ${TURNOS.join(', ')}.` });
      return;
    }
    const data = {};
    if (fechaProgramada !== undefined) data.fechaProgramada = new Date(fechaProgramada);
    if (turno !== undefined) data.turno = turno;
    if (sillonId !== undefined) data.sillonId = sillonId || null;
    if (duracionEstimadaMin !== undefined) data.duracionEstimadaMin = Number(duracionEstimadaMin);

    await prisma.cicloQuimio.update({ where: { id: ciclo.id }, data });
    await prisma.historialCiclo.create({ data: { cicloId: ciclo.id, estado: 'programado', actorUserId: req.authUser.id, comentario: 'Ciclo reagendado.' } });
    const actualizado = await loadCicloOr404(ciclo.id, res);
    if (!actualizado) return;
    res.json({ ciclo: serializeCiclo(actualizado) });
  });

  router.post('/quimio/ciclos/:id/transicion', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { accion, comentario, fecha, observaciones, reaccionAdversa } = req.body ?? {};
    if (!accion || !ACCIONES_CICLO[accion]) {
      res.status(400).json({ error: `accion inválida. Opciones: ${Object.keys(ACCIONES_CICLO).join(', ')}.` });
      return;
    }
    if (!rolPuedeAccion(req.authUser.role, accion)) {
      res.status(403).json({ error: 'No autorizado para esta acción.' });
      return;
    }

    const ciclo = await loadCicloOr404(req.params.id, res);
    if (!ciclo) return;

    try {
      await prisma.$transaction(async (tx) => {
        await aplicarTransicionCiclo(tx, { ciclo, accion, actorUserId: req.authUser.id, comentario, fecha, observaciones, reaccionAdversa });
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const actualizado = await loadCicloOr404(ciclo.id, res);
    if (!actualizado) return;
    res.json({ ciclo: serializeCiclo(actualizado) });
  });

  // --- Grilla de sillones ------------------------------------------------------------

  router.get('/quimio/grilla', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const desde = req.query.desde ? new Date(req.query.desde) : new Date();
    const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date(desde.getTime() + 6 * 86400000);

    const [sillones, ciclos] = await Promise.all([
      prisma.sillon.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.cicloQuimio.findMany({
        where: { fechaProgramada: { gte: desde, lte: hasta }, estado: { notIn: ['cancelado'] } },
        include: CICLO_INCLUDE,
      }),
    ]);

    res.json(construirGrilla(ciclos, sillones, desde, hasta));
  });

  // --- Estadísticas ------------------------------------------------------------

  async function obtenerCiclosAdministrados(req) {
    const desde = req.query.desde ? new Date(req.query.desde) : new Date(Date.now() - 30 * 86400000);
    const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date();
    return prisma.cicloQuimio.findMany({
      where: { estado: 'administrado', fechaTerminoReal: { gte: desde, lte: hasta } },
      include: CICLO_INCLUDE,
    });
  }

  router.get('/quimio/estadisticas', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ciclos = await obtenerCiclosAdministrados(req);
    const groupBy = req.query.groupBy === 'farmaco' || req.query.groupBy === 'sillon' || req.query.groupBy === 'profesional'
      ? req.query.groupBy
      : 'protocolo';

    const conteo = new Map();
    ciclos.forEach((c) => {
      let clave;
      if (groupBy === 'protocolo') clave = c.receta?.protocolo ?? 'Sin protocolo';
      else if (groupBy === 'sillon') clave = c.sillon?.nombre ?? 'Sin sillón';
      else if (groupBy === 'profesional') clave = c.administradoPor?.name ?? 'Sin registrar';
      else clave = c.receta?.protocolo ?? 'Sin protocolo';
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    });

    res.json({
      total: ciclos.length,
      groupBy,
      detalle: Array.from(conteo.entries()).map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
    });
  });

  router.get('/quimio/estadisticas/export', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ciclos = await obtenerCiclosAdministrados(req);

    const filas = [
      ['paciente', 'rut', 'protocolo', 'numeroCiclo', 'sillon', 'fechaInicioReal', 'fechaTerminoReal', 'administradoPor'].join(','),
      ...ciclos.map((c) => [
        JSON.stringify(c.receta?.paciente?.nombre ?? ''),
        c.receta?.paciente?.rut ?? '',
        JSON.stringify(c.receta?.protocolo ?? ''),
        c.numeroCiclo,
        JSON.stringify(c.sillon?.nombre ?? ''),
        c.fechaInicioReal ? new Date(c.fechaInicioReal).toISOString() : '',
        c.fechaTerminoReal ? new Date(c.fechaTerminoReal).toISOString() : '',
        JSON.stringify(c.administradoPor?.name ?? ''),
      ].join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estadisticas_quimio.csv"');
    res.send(filas.join('\n'));
  });

  return router;
}
