import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import {
  ACCIONES_CICLO,
  ESTADO_CICLO_LABELS,
  ESTADO_RECETA_LABELS,
  PASO_BLOQUE_MIN,
  aplicarTransicionCiclo,
  calcularBloquesLibres,
  calcularSuperficieCorporal,
  construirAgendaDia,
  construirGrilla,
  resolverConfigDia,
  rolPuedeAccion,
  seSuperponen,
  serializeCiclo,
  serializeCodigoGes,
  serializeCodigoPpv,
  serializeEsquema,
  serializeReceta,
  serializeSillon,
  sumarMinutos,
  truncarFechaUTC,
} from '../lib/quimio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function fsReadFileSync(nombreArchivoData) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'data', nombreArchivoData), 'utf-8');
}

const RECETA_EDITOR_ROLES = ['oncologo', 'admin'];
const VALIDACION_RECETA_ROLES = ['enfermera_oncologia', 'admin'];
const AGENDA_ROLES = ['enfermera_quimio', 'admin'];

const RECETA_INCLUDE = {
  paciente: true,
  medico: true,
  farmaceutico: true,
  esquema: true,
  codigosGes: { include: { codigoGes: true } },
  codigosPpv: { include: { codigoPpv: true } },
  farmacos: { orderBy: { orden: 'asc' } },
  ciclos: { orderBy: { numeroCiclo: 'asc' }, include: { sillon: true } },
};

const CICLO_INCLUDE = {
  receta: { include: { paciente: true } },
  sillon: true,
  preparadoPor: true,
  administradoPor: true,
  enfPunciona: true,
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

  async function obtenerConfigDia(fecha) {
    const fechaKey = truncarFechaUTC(fecha);
    const diaHabilRow = await prisma.diaHabilQuimio.findUnique({ where: { fecha: fechaKey } });
    return resolverConfigDia(diaHabilRow, fechaKey);
  }

  // --- Esquemas (catálogo) ------------------------------------------------------------

  router.get('/quimio/esquemas', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = { activo: true, ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}) };
    const esquemas = await prisma.esquemaQuimio.findMany({ where, orderBy: { nombre: 'asc' }, include: { codigoPpv: true } });
    res.json({ esquemas: esquemas.map(serializeEsquema) });
  });

  router.get('/quimio/esquemas/:id', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const esquema = await prisma.esquemaQuimio.findUnique({
      where: { id: req.params.id },
      include: { lineas: { orderBy: { orden: 'asc' } }, codigoPpv: true },
    });
    if (!esquema) {
      res.status(404).json({ error: 'Esquema no encontrado.' });
      return;
    }
    res.json({ esquema: serializeEsquema(esquema) });
  });

  // --- Códigos GES y PPV no GES (catálogos) ---------------------------------------------------
  // Importados desde la planilla real de la usuaria (prisma/importar_codificacion_qmt.js). El
  // oncólogo puede asociar uno de los dos (opcional, no ambos a la vez) a la receta al prescribir
  // — igual que en la planilla de origen, donde un ingreso es GES o PPV no GES, no las dos cosas.

  router.get('/quimio/codigos-ges', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = {
      activo: true,
      ...(q ? { OR: [
        { familia: { contains: q, mode: 'insensitive' } },
        { problemaSalud: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    const codigos = await prisma.codigoGes.findMany({ where, orderBy: [{ problemaSalud: 'asc' }, { codigo: 'asc' }] });
    res.json({ codigosGes: codigos.map(serializeCodigoGes) });
  });

  router.patch('/quimio/codigos-ges/:id', async (req, res) => {
    if (!requireRoles(req, res, ['admin'])) return;
    const data = {};
    if (typeof req.body?.activo === 'boolean') data.activo = req.body.activo;
    const actualizado = await prisma.codigoGes.update({ where: { id: req.params.id }, data });
    res.json({ codigoGes: serializeCodigoGes(actualizado) });
  });

  router.get('/quimio/codigos-ppv-no-ges', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = {
      activo: true,
      ...(q ? { OR: [
        { glosaTrazadora: { contains: q, mode: 'insensitive' } },
        { familia: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    const codigos = await prisma.codigoPpvNoGes.findMany({ where, orderBy: { codigo: 'asc' } });
    res.json({ codigosPpv: codigos.map(serializeCodigoPpv) });
  });

  router.patch('/quimio/codigos-ppv-no-ges/:id', async (req, res) => {
    if (!requireRoles(req, res, ['admin'])) return;
    const data = {};
    if (typeof req.body?.activo === 'boolean') data.activo = req.body.activo;
    const actualizado = await prisma.codigoPpvNoGes.update({ where: { id: req.params.id }, data });
    res.json({ codigoPpv: serializeCodigoPpv(actualizado) });
  });

  // --- Referencia DAC / LRS (para autosugerir clasificación por fármaco) -----------------------
  // Listas derivadas de la misma planilla ("Codificación DAC" y "Codificación LRS") — no son un
  // catálogo seleccionable, solo referencia para que RecetaForm sugiera LRS/DAC cuando el nombre
  // del fármaco coincide; el usuario siempre puede cambiarlo a mano.
  let clasificacionReferenciaCache = null;
  router.get('/quimio/clasificacion-referencia', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!clasificacionReferenciaCache) {
      try {
        clasificacionReferenciaCache = {
          dac: JSON.parse(fsReadFileSync('drogas_dac.json')),
          lrs: JSON.parse(fsReadFileSync('drogas_lrs.json')),
        };
      } catch {
        clasificacionReferenciaCache = { dac: [], lrs: [] };
      }
    }
    res.json(clasificacionReferenciaCache);
  });

  // Catálogo de nombres de fármaco para autocompletar/homologar al escribir en la receta —
  // combina las drogas reales de los 86 esquemas (tal cual están en la BD) con las listas DAC y
  // LRS de la planilla. Es solo sugerencia (datalist): el campo sigue siendo texto libre.
  let farmacosReferenciaCache = null;
  router.get('/quimio/farmacos-referencia', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!farmacosReferenciaCache) {
      const lineas = await prisma.esquemaFarmacoLinea.findMany({ select: { droga: true }, distinct: ['droga'] });
      let dac = [];
      let lrs = [];
      try {
        dac = JSON.parse(fsReadFileSync('drogas_dac.json'));
        lrs = JSON.parse(fsReadFileSync('drogas_lrs.json'));
      } catch { /* catálogo opcional */ }

      const vistos = new Map(); // clave normalizada -> primera forma de escritura encontrada
      [...lineas.map((l) => l.droga), ...dac, ...lrs].forEach((nombre) => {
        const limpio = (nombre || '').trim();
        if (!limpio) return;
        const clave = limpio.toLowerCase();
        if (!vistos.has(clave)) vistos.set(clave, limpio);
      });
      farmacosReferenciaCache = Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'es'));
    }
    res.json({ nombres: farmacosReferenciaCache });
  });

  // --- Sillones ------------------------------------------------------------

  router.get('/sillones', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const sillones = await prisma.sillon.findMany({ orderBy: { orden: 'asc' } });
    res.json({ sillones: sillones.map(serializeSillon) });
  });

  router.post('/sillones', async (req, res) => {
    if (!requireRoles(req, res, ['admin'])) return;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre) {
      res.status(400).json({ error: 'nombre es obligatorio.' });
      return;
    }
    const ultimo = await prisma.sillon.findFirst({ orderBy: { orden: 'desc' } });
    const sillon = await prisma.sillon.create({ data: { nombre, orden: (ultimo?.orden ?? 0) + 1 } });
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
      nSesion: f.nSesion ?? null,
      clasificacion: f.clasificacion ?? null,
      duracionInfusionMin: f.duracionInfusionMin ? Number(f.duracionInfusionMin) : null,
      orden: idx,
    };
  }

  router.post('/quimio/recetas', async (req, res) => {
    if (!requireRoles(req, res, RECETA_EDITOR_ROLES)) return;
    const {
      pacienteId, esquemaId, codigoGesIds, codigoPpvIds, protocolo, indicacion, diagnostico, estadio, intencion, riesgoEmetico,
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
        esquemaId: esquemaId || null,
        protocolo,
        indicacion: indicacion ?? null,
        diagnostico: diagnostico ?? null,
        estadio: estadio ?? null,
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
        codigosGes: {
          create: Array.isArray(codigoGesIds) ? [...new Set(codigoGesIds)].map((id) => ({ codigoGesId: id })) : [],
        },
        codigosPpv: {
          create: Array.isArray(codigoPpvIds) ? [...new Set(codigoPpvIds)].map((id) => ({ codigoPpvId: id })) : [],
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
      esquemaId, codigoGesIds, codigoPpvIds, protocolo, indicacion, diagnostico, estadio, intencion, riesgoEmetico,
      numeroCiclosTotal, intervaloDias, pesoKg, tallaCm, superficieCorporal,
      otrasIndicaciones, neupogenIndicado, neupogenDias, farmacos,
    } = req.body ?? {};
    const data = {};
    if (esquemaId !== undefined) data.esquemaId = esquemaId || null;
    if (protocolo !== undefined) data.protocolo = protocolo;
    if (indicacion !== undefined) data.indicacion = indicacion;
    if (diagnostico !== undefined) data.diagnostico = diagnostico;
    if (estadio !== undefined) data.estadio = estadio;
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
      if (Array.isArray(codigoGesIds)) {
        await tx.recetaCodigoGes.deleteMany({ where: { recetaId: receta.id } });
        await tx.recetaCodigoGes.createMany({
          data: [...new Set(codigoGesIds)].map((codigoGesId) => ({ recetaId: receta.id, codigoGesId })),
        });
      }
      if (Array.isArray(codigoPpvIds)) {
        await tx.recetaCodigoPpv.deleteMany({ where: { recetaId: receta.id } });
        await tx.recetaCodigoPpv.createMany({
          data: [...new Set(codigoPpvIds)].map((codigoPpvId) => ({ recetaId: receta.id, codigoPpvId })),
        });
      }
    });

    const actualizada = await loadRecetaOr404(receta.id, res);
    if (!actualizada) return;
    res.json({ receta: serializeReceta(actualizada) });
  });

  router.post('/quimio/recetas/:id/validar', async (req, res) => {
    if (!requireRoles(req, res, VALIDACION_RECETA_ROLES)) return;
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
    if (!requireRoles(req, res, VALIDACION_RECETA_ROLES)) return;
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

  // --- Pacientes en espera (panel al costado del calendario de Sillones) -----------------------
  // Toda receta activa (borrador esperando validación, o validada esperando/en tratamiento),
  // ordenada por antigüedad (createdAt asc) — la que lleva más tiempo esperando aparece primero.
  router.get('/quimio/pacientes-espera', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const recetas = await prisma.recetaQuimio.findMany({
      where: { estado: { in: ['borrador', 'validada'] } },
      include: { paciente: true, ciclos: { orderBy: { fechaProgramada: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    const hoy = truncarFechaUTC(new Date());
    const pacientes = recetas.map((r) => {
      const proximo = r.ciclos.find((c) =>
        ['programado', 'en_preparacion', 'listo_para_administrar', 'en_administracion'].includes(c.estado)
        && truncarFechaUTC(c.fechaProgramada) >= hoy
      );
      return {
        recetaId: r.id,
        pacienteId: r.pacienteId,
        pacienteNombre: r.paciente?.nombre ?? null,
        rut: r.paciente?.rut ?? null,
        protocolo: r.protocolo,
        estado: r.estado,
        estadoLabel: ESTADO_RECETA_LABELS[r.estado] ?? r.estado,
        ciclosCompletados: r.ciclos.filter((c) => c.estado === 'administrado').length,
        ciclosTotal: r.numeroCiclosTotal,
        proximaSesion: proximo ? { fecha: proximo.fechaProgramada, horaInicio: proximo.horaInicio } : null,
        diasEnEspera: Math.floor((hoy.getTime() - truncarFechaUTC(r.createdAt).getTime()) / 86400000),
        createdAt: r.createdAt,
      };
    });

    res.json({ pacientes });
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

  // Valida que [horaInicio, horaInicio+duracionMin) quepa dentro del horario hábil del día y no
  // choque con otro ciclo ya agendado en ese sillón (cancelado no cuenta como ocupado — libera
  // el bloque). Devuelve { ok:true, horaTermino } o { ok:false, error }.
  async function validarHorario({ fecha, horaInicio, duracionMin, sillonId, excluirCicloId }) {
    const configDia = await obtenerConfigDia(fecha);
    if (!configDia.habil) {
      return { ok: false, error: configDia.feriado ? 'Ese día es feriado.' : 'Ese día no es hábil.' };
    }
    const horaTermino = sumarMinutos(horaInicio, duracionMin);
    if (horaInicio < configDia.horaInicio || horaTermino > configDia.horaFin) {
      return { ok: false, error: `Fuera del horario hábil (${configDia.horaInicio}-${configDia.horaFin}).` };
    }
    if (sillonId) {
      const fechaInicioDia = truncarFechaUTC(fecha);
      const fechaFinDia = new Date(fechaInicioDia.getTime() + 86400000);
      const ciclosDelDia = await prisma.cicloQuimio.findMany({
        where: {
          sillonId,
          fechaProgramada: { gte: fechaInicioDia, lt: fechaFinDia },
          estado: { notIn: ['cancelado'] },
          ...(excluirCicloId ? { id: { not: excluirCicloId } } : {}),
        },
      });
      const choca = ciclosDelDia.some((c) => seSuperponen(horaInicio, horaTermino, c.horaInicio, c.horaTermino));
      if (choca) return { ok: false, error: 'Ese sillón ya tiene una sesión agendada que se superpone con ese horario.' };
    }
    return { ok: true, horaTermino };
  }

  // Duración estimada de una sesión a partir de los fármacos de quimioterapia de la receta
  // (mismo criterio que usa el frontend en TableroPaciente/AgendarCicloForm).
  function duracionSugeridaReceta(receta) {
    const minutosQuimio = (receta.farmacos ?? [])
      .filter((f) => f.categoria === 'quimioterapia' && f.duracionInfusionMin)
      .reduce((sum, f) => sum + f.duracionInfusionMin, 0);
    return minutosQuimio > 0 ? minutosQuimio + 30 : 180;
  }

  // Propone fecha/hora/sillón para TODOS los ciclos restantes de una receta, respetando el
  // intervaloDias del esquema y la disponibilidad real del calendario de sillones: para cada
  // ciclo busca, a partir de la fecha ancla (último ciclo ya agendado + intervalo, o fechaInicio
  // si no hay ninguno todavía), el primer día hábil con cupo (hasta 30 días de margen), en el
  // primer sillón (por orden) que tenga un bloque libre de duracionMin. Lleva un registro de
  // "reservas virtuales" propuestas en esta misma pasada para no proponer dos ciclos encimados
  // si llegaran a caer el mismo día y sillón.
  async function calcularPropuestaAgendamiento({ receta, fechaInicio, duracionMin }) {
    const sillones = await prisma.sillon.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
    const ciclosExistentes = receta.ciclos ?? [];
    const numeroInicial = ciclosExistentes.length + 1;
    const propuestas = [];
    const reservasVirtuales = [];

    let fechaBase = ciclosExistentes.length
      ? new Date(truncarFechaUTC(ciclosExistentes[ciclosExistentes.length - 1].fechaProgramada).getTime() + receta.intervaloDias * 86400000)
      : truncarFechaUTC(fechaInicio);

    for (let numeroCiclo = numeroInicial; numeroCiclo <= receta.numeroCiclosTotal; numeroCiclo++) {
      let encontrado = null;
      let cursor = new Date(fechaBase);
      for (let intento = 0; intento < 30 && !encontrado; intento++) {
        const configDia = await obtenerConfigDia(cursor);
        if (configDia.habil) {
          const fechaInicioDia = truncarFechaUTC(cursor);
          const fechaFinDia = new Date(fechaInicioDia.getTime() + 86400000);
          const fechaKey = fechaInicioDia.toISOString().slice(0, 10);
          for (const sillon of sillones) {
            const ciclosDelDiaDb = await prisma.cicloQuimio.findMany({
              where: { sillonId: sillon.id, fechaProgramada: { gte: fechaInicioDia, lt: fechaFinDia }, estado: { notIn: ['cancelado'] } },
            });
            const virtuales = reservasVirtuales.filter((r) => r.fechaKey === fechaKey && r.sillonId === sillon.id);
            const libres = calcularBloquesLibres(configDia, [...ciclosDelDiaDb, ...virtuales], duracionMin);
            if (libres.length) {
              encontrado = { fecha: new Date(cursor), fechaKey, sillonId: sillon.id, sillonNombre: sillon.nombre, horaInicio: libres[0], horaTermino: sumarMinutos(libres[0], duracionMin) };
              break;
            }
          }
        }
        if (!encontrado) cursor = new Date(cursor.getTime() + 86400000);
      }
      if (!encontrado) {
        propuestas.push({ numeroCiclo, error: 'Sin cupo disponible en los próximos 30 días a partir de la fecha estimada.' });
        fechaBase = new Date(fechaBase.getTime() + receta.intervaloDias * 86400000);
        continue;
      }
      reservasVirtuales.push({ fechaKey: encontrado.fechaKey, sillonId: encontrado.sillonId, horaInicio: encontrado.horaInicio, horaTermino: encontrado.horaTermino });
      propuestas.push({
        numeroCiclo,
        fechaProgramada: encontrado.fechaKey,
        horaInicio: encontrado.horaInicio,
        horaTermino: encontrado.horaTermino,
        sillonId: encontrado.sillonId,
        sillonNombre: encontrado.sillonNombre,
      });
      fechaBase = new Date(encontrado.fecha.getTime() + receta.intervaloDias * 86400000);
    }
    return propuestas;
  }

  router.post('/quimio/ciclos', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const { recetaId, numeroCiclo, fechaProgramada, horaInicio, sillonId, duracionEstimadaMin } = req.body ?? {};
    if (!recetaId || !numeroCiclo || !fechaProgramada || !horaInicio) {
      res.status(400).json({ error: 'recetaId, numeroCiclo, fechaProgramada y horaInicio son obligatorios.' });
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

    const duracionMin = duracionEstimadaMin ? Number(duracionEstimadaMin) : 180;
    const fecha = new Date(fechaProgramada);
    const validacion = await validarHorario({ fecha, horaInicio, duracionMin, sillonId });
    if (!validacion.ok) {
      res.status(400).json({ error: validacion.error });
      return;
    }

    const ciclo = await prisma.cicloQuimio.create({
      data: {
        recetaId,
        numeroCiclo: Number(numeroCiclo),
        fechaProgramada: fecha,
        horaInicio,
        horaTermino: validacion.horaTermino,
        sillonId: sillonId ?? null,
        duracionEstimadaMin: duracionMin,
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
    const { fechaProgramada, horaInicio, sillonId, duracionEstimadaMin } = req.body ?? {};

    const fecha = fechaProgramada !== undefined ? new Date(fechaProgramada) : ciclo.fechaProgramada;
    const horaInicioFinal = horaInicio !== undefined ? horaInicio : ciclo.horaInicio;
    const duracionMin = duracionEstimadaMin !== undefined ? Number(duracionEstimadaMin) : ciclo.duracionEstimadaMin;
    const sillonIdFinal = sillonId !== undefined ? (sillonId || null) : ciclo.sillonId;

    const validacion = await validarHorario({ fecha, horaInicio: horaInicioFinal, duracionMin, sillonId: sillonIdFinal, excluirCicloId: ciclo.id });
    if (!validacion.ok) {
      res.status(400).json({ error: validacion.error });
      return;
    }

    await prisma.cicloQuimio.update({
      where: { id: ciclo.id },
      data: {
        fechaProgramada: fecha,
        horaInicio: horaInicioFinal,
        horaTermino: validacion.horaTermino,
        sillonId: sillonIdFinal,
        duracionEstimadaMin: duracionMin,
      },
    });
    await prisma.historialCiclo.create({ data: { cicloId: ciclo.id, estado: 'programado', actorUserId: req.authUser.id, comentario: 'Ciclo reagendado.' } });
    const actualizado = await loadCicloOr404(ciclo.id, res);
    if (!actualizado) return;
    res.json({ ciclo: serializeCiclo(actualizado) });
  });

  // Reprogramar: igual que el PATCH anterior para un solo ciclo, pero con la opción de arrastrar
  // el mismo desplazamiento de días a todos los ciclos "programado" restantes de la misma receta
  // (mismo horaInicio/sillón de cada uno, solo cambia la fecha). Valida TODOS los horarios antes
  // de aplicar nada — si uno choca, no se mueve ninguno, para no dejar la receta a medio mover.
  router.post('/quimio/ciclos/:id/reprogramar', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const ciclo = await loadCicloOr404(req.params.id, res);
    if (!ciclo) return;
    if (ciclo.estado !== 'programado') {
      res.status(400).json({ error: 'Solo se puede reprogramar un ciclo en estado programado.' });
      return;
    }
    const { fechaProgramada, horaInicio, sillonId, aplicarATodos } = req.body ?? {};
    if (!fechaProgramada || !horaInicio) {
      res.status(400).json({ error: 'fechaProgramada y horaInicio son obligatorios.' });
      return;
    }

    const fechaOriginal = truncarFechaUTC(ciclo.fechaProgramada);
    const fechaNueva = truncarFechaUTC(fechaProgramada);
    const deltaDias = Math.round((fechaNueva.getTime() - fechaOriginal.getTime()) / 86400000);
    const sillonIdFinal = sillonId !== undefined ? (sillonId || null) : ciclo.sillonId;

    const validacionPrincipal = await validarHorario({ fecha: fechaNueva, horaInicio, duracionMin: ciclo.duracionEstimadaMin, sillonId: sillonIdFinal, excluirCicloId: ciclo.id });
    if (!validacionPrincipal.ok) {
      res.status(400).json({ error: validacionPrincipal.error });
      return;
    }

    const actualizaciones = [{
      id: ciclo.id,
      fechaProgramada: fechaNueva,
      horaInicio,
      horaTermino: validacionPrincipal.horaTermino,
      sillonId: sillonIdFinal,
    }];

    if (aplicarATodos) {
      const otros = await prisma.cicloQuimio.findMany({
        where: {
          recetaId: ciclo.recetaId,
          id: { not: ciclo.id },
          estado: 'programado',
          fechaProgramada: { gt: ciclo.fechaProgramada },
        },
      });
      for (const otro of otros) {
        const fechaOtroNueva = new Date(truncarFechaUTC(otro.fechaProgramada).getTime() + deltaDias * 86400000);
        const validacionOtro = await validarHorario({ fecha: fechaOtroNueva, horaInicio: otro.horaInicio, duracionMin: otro.duracionEstimadaMin, sillonId: otro.sillonId, excluirCicloId: otro.id });
        if (!validacionOtro.ok) {
          res.status(400).json({ error: `No se pudo reprogramar también el ciclo ${otro.numeroCiclo} (quedaría el ${fechaOtroNueva.toISOString().slice(0, 10)}): ${validacionOtro.error}` });
          return;
        }
        actualizaciones.push({
          id: otro.id,
          fechaProgramada: fechaOtroNueva,
          horaInicio: otro.horaInicio,
          horaTermino: validacionOtro.horaTermino,
          sillonId: otro.sillonId,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const u of actualizaciones) {
        await tx.cicloQuimio.update({
          where: { id: u.id },
          data: { fechaProgramada: u.fechaProgramada, horaInicio: u.horaInicio, horaTermino: u.horaTermino, sillonId: u.sillonId },
        });
        await tx.historialCiclo.create({
          data: { cicloId: u.id, estado: 'programado', actorUserId: req.authUser.id, comentario: u.id === ciclo.id ? 'Ciclo reprogramado.' : 'Ciclo reprogramado junto al resto de la receta.' },
        });
      }
    });

    const actualizado = await loadCicloOr404(ciclo.id, res);
    if (!actualizado) return;
    res.json({ ciclo: serializeCiclo(actualizado), ciclosActualizados: actualizaciones.length });
  });

  // Propuesta automática de agendamiento: calcula fecha/hora/sillón para todos los ciclos
  // restantes de la receta de una vez, según su intervaloDias y la disponibilidad real. Solo
  // calcula — no crea nada todavía (eso lo hace /agendar-propuesta, una vez el usuario acepta o
  // edita la propuesta).
  router.get('/quimio/recetas/:id/propuesta-agendamiento', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    if (receta.estado !== 'validada') {
      res.status(400).json({ error: 'Solo se pueden proponer ciclos de una receta validada.' });
      return;
    }
    const restantes = receta.numeroCiclosTotal - (receta.ciclos?.length ?? 0);
    if (restantes <= 0) {
      res.json({ propuestas: [], duracionMin: 0 });
      return;
    }
    const fechaInicio = req.query.fechaInicio ? new Date(req.query.fechaInicio) : new Date();
    const duracionMin = req.query.duracionMin ? Number(req.query.duracionMin) : duracionSugeridaReceta(receta);
    const propuestas = await calcularPropuestaAgendamiento({ receta, fechaInicio, duracionMin });
    res.json({ propuestas, duracionMin });
  });

  // Acepta (con o sin ediciones) la propuesta de agendamiento: valida TODOS los ciclos
  // propuestos (hábil + colisión, igual que /quimio/ciclos, más una verificación cruzada entre
  // ellos mismos por si el usuario editó dos filas al mismo sillón/horario) antes de crear
  // ninguno — todo o nada, mismo criterio que /reprogramar.
  router.post('/quimio/recetas/:id/agendar-propuesta', async (req, res) => {
    if (!requireRoles(req, res, AGENDA_ROLES)) return;
    const receta = await loadRecetaOr404(req.params.id, res);
    if (!receta) return;
    if (receta.estado !== 'validada') {
      res.status(400).json({ error: 'Solo se pueden agendar ciclos de una receta validada.' });
      return;
    }
    const { ciclos, duracionEstimadaMin } = req.body ?? {};
    if (!Array.isArray(ciclos) || !ciclos.length) {
      res.status(400).json({ error: 'ciclos es obligatorio y debe tener al menos un elemento.' });
      return;
    }
    const duracionMin = duracionEstimadaMin ? Number(duracionEstimadaMin) : duracionSugeridaReceta(receta);

    const items = ciclos.map((c) => ({ ...c, fecha: new Date(c.fechaProgramada) }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (
          a.sillonId && a.sillonId === b.sillonId
          && truncarFechaUTC(a.fecha).getTime() === truncarFechaUTC(b.fecha).getTime()
          && seSuperponen(a.horaInicio, sumarMinutos(a.horaInicio, duracionMin), b.horaInicio, sumarMinutos(b.horaInicio, duracionMin))
        ) {
          res.status(400).json({ error: `Los ciclos ${a.numeroCiclo} y ${b.numeroCiclo} quedarían con el mismo sillón y horario superpuesto.` });
          return;
        }
      }
    }

    const validados = [];
    for (const item of items) {
      const validacion = await validarHorario({ fecha: item.fecha, horaInicio: item.horaInicio, duracionMin, sillonId: item.sillonId });
      if (!validacion.ok) {
        res.status(400).json({ error: `Ciclo ${item.numeroCiclo}: ${validacion.error}` });
        return;
      }
      validados.push({ ...item, horaTermino: validacion.horaTermino });
    }

    const creados = await prisma.$transaction(async (tx) => {
      const resultado = [];
      for (const v of validados) {
        const ciclo = await tx.cicloQuimio.create({
          data: {
            recetaId: receta.id,
            numeroCiclo: Number(v.numeroCiclo),
            fechaProgramada: v.fecha,
            horaInicio: v.horaInicio,
            horaTermino: v.horaTermino,
            sillonId: v.sillonId || null,
            duracionEstimadaMin: duracionMin,
          },
        });
        await tx.historialCiclo.create({ data: { cicloId: ciclo.id, estado: 'programado', actorUserId: req.authUser.id, comentario: 'Ciclo agendado desde propuesta automática.' } });
        resultado.push(ciclo);
      }
      return resultado;
    });

    res.status(201).json({ ciclosCreados: creados.length });
  });

  // --- Disponibilidad (bloques de 30 min por sillón para un día) ------------------------------

  router.get('/quimio/disponibilidad', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!req.query.fecha) {
      res.status(400).json({ error: 'fecha es obligatoria.' });
      return;
    }
    const fecha = new Date(req.query.fecha);
    const duracionMin = req.query.duracionMin ? Number(req.query.duracionMin) : 180;
    const configDia = await obtenerConfigDia(fecha);

    const fechaInicioDia = truncarFechaUTC(fecha);
    const fechaFinDia = new Date(fechaInicioDia.getTime() + 86400000);

    const [sillones, ciclosDelDia] = await Promise.all([
      prisma.sillon.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
      prisma.cicloQuimio.findMany({
        where: { fechaProgramada: { gte: fechaInicioDia, lt: fechaFinDia }, estado: { notIn: ['cancelado'] } },
        include: { receta: { include: { paciente: true } } },
      }),
    ]);

    const sillonesConAgenda = sillones.map((sillon) => {
      const ciclosDelSillon = ciclosDelDia
        .filter((c) => c.sillonId === sillon.id)
        .map((c) => ({ ...c, pacienteNombre: c.receta?.paciente?.nombre ?? null }));
      return {
        id: sillon.id,
        nombre: sillon.nombre,
        bloques: construirAgendaDia(configDia, ciclosDelSillon, duracionMin),
      };
    });

    res.json({
      fecha: req.query.fecha,
      habil: configDia.habil,
      feriado: configDia.feriado,
      horaInicio: configDia.horaInicio,
      horaFin: configDia.horaFin,
      pasoBloqueMin: PASO_BLOQUE_MIN,
      sillones: sillonesConAgenda,
    });
  });

  // --- Calendario (hábil/feriado/horario por día, para pintar el calendario mensual) -----------

  router.get('/quimio/calendario', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!req.query.desde || !req.query.hasta) {
      res.status(400).json({ error: 'desde y hasta son obligatorios.' });
      return;
    }
    const desde = truncarFechaUTC(req.query.desde);
    const hasta = truncarFechaUTC(req.query.hasta);

    const filas = await prisma.diaHabilQuimio.findMany({ where: { fecha: { gte: desde, lte: hasta } } });
    const porFecha = new Map(filas.map((f) => [f.fecha.toISOString().slice(0, 10), f]));

    const dias = [];
    const cursor = new Date(desde);
    while (cursor <= hasta) {
      const key = cursor.toISOString().slice(0, 10);
      const config = resolverConfigDia(porFecha.get(key) ?? null, cursor);
      dias.push({ fecha: key, ...config });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    res.json({ dias });
  });

  router.post('/quimio/ciclos/:id/transicion', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { accion, comentario, fecha, observaciones, reaccionAdversa, detalle } = req.body ?? {};
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
        await aplicarTransicionCiclo(tx, { ciclo, accion, actorUserId: req.authUser.id, comentario, fecha, observaciones, reaccionAdversa, detalle });
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
      prisma.sillon.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
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
      include: {
        receta: {
          include: {
            paciente: true,
            farmacos: true,
            codigosGes: { include: { codigoGes: true } },
            codigosPpv: { include: { codigoPpv: true } },
          },
        },
        sillon: true,
        administradoPor: true,
      },
    });
  }

  router.get('/quimio/estadisticas', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ciclos = await obtenerCiclosAdministrados(req);
    const groupBy = ['farmaco', 'sillon', 'profesional', 'ges', 'ppv'].includes(req.query.groupBy) ? req.query.groupBy : 'protocolo';

    // "farmaco" y la clasificación LRS/DAC cuentan por LÍNEA de fármaco de quimioterapia de la
    // receta de cada ciclo administrado (un ciclo puede tener varios fármacos) — representa
    // administraciones reales, no recetas distintas. El resto agrupa 1 fila por ciclo.
    const conteo = new Map();
    const conteoClasificacion = new Map();
    ciclos.forEach((c) => {
      const lineasQuimio = (c.receta?.farmacos ?? []).filter((f) => f.categoria === 'quimioterapia');
      lineasQuimio.forEach((f) => {
        const clave = f.clasificacion || 'Sin clasificar';
        conteoClasificacion.set(clave, (conteoClasificacion.get(clave) ?? 0) + 1);
      });

      if (groupBy === 'farmaco') {
        lineasQuimio.forEach((f) => conteo.set(f.farmaco, (conteo.get(f.farmaco) ?? 0) + 1));
        return;
      }
      // "ges" y "ppv" cuentan por CÓDIGO, no por ciclo — una receta puede tributar más de una
      // línea de producción (ej. esquema base + un fármaco agregado aparte, cada uno su propio
      // código), así que un solo ciclo administrado puede sumar más de una línea acá.
      if (groupBy === 'ges') {
        const codigos = c.receta?.codigosGes ?? [];
        if (!codigos.length) { conteo.set('Sin código GES', (conteo.get('Sin código GES') ?? 0) + 1); return; }
        codigos.forEach((r) => {
          const clave = `${r.codigoGes.codigo} — ${r.codigoGes.familia}`;
          conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
        });
        return;
      }
      if (groupBy === 'ppv') {
        const codigos = c.receta?.codigosPpv ?? [];
        if (!codigos.length) { conteo.set('Sin código PPV no GES', (conteo.get('Sin código PPV no GES') ?? 0) + 1); return; }
        codigos.forEach((r) => {
          const clave = `${r.codigoPpv.codigo} — ${r.codigoPpv.glosaTrazadora}`;
          conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
        });
        return;
      }
      let clave;
      if (groupBy === 'sillon') clave = c.sillon?.nombre ?? 'Sin sillón';
      else if (groupBy === 'profesional') clave = c.administradoPor?.name ?? 'Sin registrar';
      else clave = c.receta?.protocolo ?? 'Sin protocolo';
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    });

    const conReaccion = ciclos.filter((c) => c.reaccionAdversa).length;

    const [porEstadoCicloRaw, porEstadoRecetaRaw, pacientesEnTratamiento] = await Promise.all([
      prisma.cicloQuimio.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.recetaQuimio.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.recetaQuimio.findMany({ where: { estado: 'validada' }, select: { pacienteId: true }, distinct: ['pacienteId'] }),
    ]);

    res.json({
      total: ciclos.length,
      groupBy,
      detalle: Array.from(conteo.entries()).map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
      porClasificacionFarmaco: Array.from(conteoClasificacion.entries()).map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
      reaccionesAdversas: { total: ciclos.length, conReaccion, porcentaje: ciclos.length ? Math.round((conReaccion / ciclos.length) * 100) : 0 },
      // Estos dos son una fotografía del estado ACTUAL de todo el pipeline (no filtran por
      // desde/hasta) — a diferencia de "total" y "detalle", que sí son del período elegido.
      porEstadoCiclo: porEstadoCicloRaw.map((x) => ({ estado: x.estado, estadoLabel: ESTADO_CICLO_LABELS[x.estado] ?? x.estado, cantidad: x._count._all })),
      porEstadoReceta: porEstadoRecetaRaw.map((x) => ({ estado: x.estado, estadoLabel: ESTADO_RECETA_LABELS[x.estado] ?? x.estado, cantidad: x._count._all })),
      pacientesEnTratamiento: pacientesEnTratamiento.length,
    });
  });

  router.get('/quimio/estadisticas/export', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ciclos = await obtenerCiclosAdministrados(req);

    const filas = [
      ['paciente', 'rut', 'protocolo', 'codigoGes', 'codigoPpvNoGes', 'numeroCiclo', 'sillon', 'fechaInicioReal', 'fechaTerminoReal', 'administradoPor'].join(','),
      ...ciclos.map((c) => [
        JSON.stringify(c.receta?.paciente?.nombre ?? ''),
        c.receta?.paciente?.rut ?? '',
        JSON.stringify(c.receta?.protocolo ?? ''),
        JSON.stringify((c.receta?.codigosGes ?? []).map((r) => `${r.codigoGes.codigo} — ${r.codigoGes.familia}`).join(' | ')),
        JSON.stringify((c.receta?.codigosPpv ?? []).map((r) => `${r.codigoPpv.codigo} — ${r.codigoPpv.glosaTrazadora}`).join(' | ')),
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
