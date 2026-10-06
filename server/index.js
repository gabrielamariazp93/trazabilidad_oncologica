import fs from 'fs';
import path from 'path';
import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import {
  buildSessionExpiry,
  createSessionToken,
  hashSessionToken,
  serializeUser,
  verifyPassword,
} from './lib/auth.js';
import {
  FASE_LABELS,
  FASES,
  HITOS_POR_FASE,
  MOTIVOS_CIERRE,
  PLAZO_CONFIG_DEFAULT,
  ROLE_LABELS,
  TIPO_PLAZO_LABELS,
  TIPOS_DERIVACION,
  TIPOS_PLAZO,
  VIAS_TRATAMIENTO,
  aplicarHito,
  normalizeRut,
  recalcularAlertas,
  serializeCaso,
  serializePlazo,
} from './lib/casos.js';
import { createQuimioRouter } from './routes/quimio.js';
import { ACCIONES_CICLO, ESTADO_CICLO_LABELS, ESTADO_RECETA_LABELS, ESTADOS_RECETA, TURNOS } from './lib/quimio.js';

// timeout/maxWait por defecto (5s/2s) se quedan cortos contra Neon por la latencia de red —
// mismo ajuste que agendas-repo.
const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000,
    timeout: 20000,
  },
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const app = express();
const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Roles que pueden crear/editar casos, registrar hitos, comité y derivaciones — no administran
// usuarios ni la config de plazos GES (eso queda reservado a admin). "ges" es el actor
// administrativo encargado de los registros formales de garantía GES (descarte, confirmación,
// etapificación, tratamiento, seguimiento) del BPMN, y también avanza hitos/plazos como el
// gestor oncológico y la enfermera de policlínico.
const EDITOR_ROLES = ['admin', 'gestor_oncologico', 'enfermera_policlinico', 'ges'];

// Notas: cualquier actor que participa del caso puede dejar una, incluida admisión (coordinación
// logística) — el único rol excluido es "lectura" (acceso de solo consulta).
const NOTA_ROLES = EDITOR_ROLES.concat('admision');

const CASO_INCLUDE = {
  paciente: true,
  gestor: true,
  plazos: { orderBy: { createdAt: 'asc' } },
  hitos: { orderBy: { fecha: 'asc' }, include: { actor: true } },
  notas: { orderBy: { createdAt: 'asc' }, include: { autor: true } },
  comites: { orderBy: { fecha: 'asc' } },
  derivaciones: { orderBy: { fecha: 'asc' } },
};

async function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    req.authUser = null;
    req.sessionId = null;
    next();
    return;
  }

  const token = authHeader.slice('Bearer '.length);
  const tokenHash = hashSessionToken(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    req.authUser = null;
    req.sessionId = null;
    next();
    return;
  }

  req.authUser = session.user;
  req.sessionId = session.id;
  next();
}

app.use(authMiddleware);

function requireAuth(req, res) {
  if (req.authUser) return true;
  res.status(401).json({ error: 'Sesión requerida.' });
  return false;
}

function requireRoles(req, res, roles) {
  if (!requireAuth(req, res)) return false;
  if (roles.includes(req.authUser.role)) return true;
  res.status(403).json({ error: 'No autorizado para esta acción.' });
  return false;
}

app.use('/api', createQuimioRouter({ prisma, requireAuth, requireRoles }));

async function getPlazoConfigMap() {
  const rows = await prisma.plazoConfig.findMany();
  const map = { ...PLAZO_CONFIG_DEFAULT };
  rows.forEach((row) => {
    map[row.tipo] = row.diasPlazoDefault;
  });
  return map;
}

async function loadCasoOr404(id, res) {
  const caso = await prisma.casoOncologico.findUnique({ where: { id }, include: CASO_INCLUDE });
  if (!caso) {
    res.status(404).json({ error: 'Caso no encontrado.' });
    return null;
  }
  return caso;
}

// --- Auth ---------------------------------------------------------------

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'trazabilidad-oncologica-api', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (_req, res) => {
  const [pacientes, casos] = await Promise.all([
    prisma.paciente.count(),
    prisma.casoOncologico.count(),
  ]);
  res.json({ ok: true, database: 'postgresql', pacientes, casos, timestamp: new Date().toISOString() });
});

app.get('/api/bootstrap', async (_req, res) => {
  res.json({
    roles: Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label })),
    fases: FASES.map((id) => ({ id, label: FASE_LABELS[id], hitos: HITOS_POR_FASE[id] })),
    viasTratamiento: VIAS_TRATAMIENTO,
    motivosCierre: MOTIVOS_CIERRE,
    tiposDerivacion: TIPOS_DERIVACION,
    tiposPlazo: TIPOS_PLAZO.map((id) => ({ id, label: TIPO_PLAZO_LABELS[id] })),
    quimio: {
      estadosReceta: ESTADOS_RECETA.map((id) => ({ id, label: ESTADO_RECETA_LABELS[id] })),
      estadosCiclo: Object.keys(ESTADO_CICLO_LABELS).map((id) => ({ id, label: ESTADO_CICLO_LABELS[id] })),
      acciones: ACCIONES_CICLO,
      turnos: TURNOS,
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email y password son obligatorios.' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Credenciales inválidas.' });
    return;
  }
  const token = createSessionToken();
  await prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: buildSessionExpiry() },
  });
  res.json({ token, user: serializeUser(user) });
});

app.post('/api/auth/demo-login', async (req, res) => {
  const role = typeof req.body?.role === 'string' && req.body.role ? req.body.role : 'gestor_oncologico';
  const user = await prisma.user.findFirst({ where: { role }, orderBy: { name: 'asc' } });
  if (!user) {
    res.status(404).json({ error: 'Usuario demo no encontrado.' });
    return;
  }
  const token = createSessionToken();
  await prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: buildSessionExpiry() },
  });
  res.json({ token, password: 'demo123', user: serializeUser(user) });
});

app.get('/api/auth/me', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const user = await prisma.user.findUnique({ where: { id: req.authUser.id } });
  res.json({ user: serializeUser(user) });
});

app.post('/api/auth/logout', async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.sessionId) await prisma.authSession.delete({ where: { id: req.sessionId } });
  res.status(204).send();
});

// --- Pacientes ------------------------------------------------------------

app.get('/api/pacientes', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.json({ pacientes: [] });
    return;
  }
  const rutNormalizado = normalizeRut(q);
  const filtros = [{ nombre: { contains: q } }];
  if (rutNormalizado) filtros.push({ rut: { contains: rutNormalizado } });
  const pacientes = await prisma.paciente.findMany({
    where: { OR: filtros },
    take: 20,
    orderBy: { nombre: 'asc' },
  });
  res.json({ pacientes });
});

app.post('/api/pacientes', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES.concat('admision'))) return;
  const { rut, nombre, fechaNacimiento, sexo, telefono, origenOvalle } = req.body ?? {};
  if (!rut || !nombre) {
    res.status(400).json({ error: 'RUT y nombre son obligatorios.' });
    return;
  }
  const rutNormalizado = normalizeRut(rut);
  const paciente = await prisma.paciente.upsert({
    where: { rut: rutNormalizado },
    update: { nombre, fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null, sexo: sexo ?? null, telefono: telefono ?? null, origenOvalle: !!origenOvalle },
    create: {
      rut: rutNormalizado,
      nombre,
      fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
      sexo: sexo ?? null,
      telefono: telefono ?? null,
      origenOvalle: !!origenOvalle,
    },
  });
  res.status(201).json({ paciente });
});

// --- Casos ------------------------------------------------------------

app.get('/api/casos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  await recalcularAlertas(prisma);

  const where = {};
  if (typeof req.query.fase === 'string' && req.query.fase) where.fase = req.query.fase;
  if (typeof req.query.estado === 'string' && req.query.estado) where.estado = req.query.estado;
  if (typeof req.query.gestorUserId === 'string' && req.query.gestorUserId) where.gestorUserId = req.query.gestorUserId;

  const casos = await prisma.casoOncologico.findMany({
    where,
    include: CASO_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });

  let serializados = casos.map(serializeCaso);
  if (req.query.soloAlertas === 'true') {
    serializados = serializados.filter((c) => c.alerta);
  }
  res.json({ casos: serializados });
});

app.post('/api/casos', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES.concat('admision'))) return;
  const { pacienteId, patologiaSospecha, origenIngreso, gestorUserId } = req.body ?? {};
  if (!pacienteId || !patologiaSospecha) {
    res.status(400).json({ error: 'pacienteId y patologiaSospecha son obligatorios.' });
    return;
  }
  const paciente = await prisma.paciente.findUnique({ where: { id: pacienteId } });
  if (!paciente) {
    res.status(404).json({ error: 'Paciente no encontrado.' });
    return;
  }

  const plazoConfigByTipo = await getPlazoConfigMap();

  const casoId = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.casoOncologico.create({
      data: {
        pacienteId,
        patologiaSospecha,
        origenIngreso: origenIngreso ?? null,
        gestorUserId: gestorUserId ?? req.authUser.id,
      },
    });
    await aplicarHito(tx, {
      caso: nuevo,
      hitoId: 'ingreso_ic_ges',
      actorUserId: req.authUser.id,
      comentario: 'Caso creado.',
      plazoConfigByTipo,
    });
    return nuevo.id;
  });

  const caso = await loadCasoOr404(casoId, res);
  if (!caso) return;
  res.status(201).json({ caso: serializeCaso(caso) });
});

app.get('/api/casos/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;
  res.json({ caso: serializeCaso(caso) });
});

app.patch('/api/casos/:id', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;

  const data = {};
  const { gestorUserId, viaTratamiento, estado, motivoCierre } = req.body ?? {};
  if (gestorUserId !== undefined) data.gestorUserId = gestorUserId || null;
  if (viaTratamiento !== undefined) data.viaTratamiento = viaTratamiento || null;
  if (estado === 'cerrado') {
    data.estado = 'cerrado';
    data.motivoCierre = motivoCierre ?? null;
    data.fechaCierre = new Date();
  } else if (estado === 'activo') {
    data.estado = 'activo';
    data.motivoCierre = null;
    data.fechaCierre = null;
  }

  await prisma.casoOncologico.update({ where: { id: caso.id }, data });
  const actualizado = await loadCasoOr404(caso.id, res);
  if (!actualizado) return;
  res.json({ caso: serializeCaso(actualizado) });
});

app.post('/api/casos/:id/hitos', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;

  const { hito, comentario, fecha } = req.body ?? {};
  if (!hito) {
    res.status(400).json({ error: 'hito es obligatorio.' });
    return;
  }

  const plazoConfigByTipo = await getPlazoConfigMap();

  try {
    await prisma.$transaction(async (tx) => {
      await aplicarHito(tx, {
        caso,
        hitoId: hito,
        actorUserId: req.authUser.id,
        comentario: comentario ?? null,
        fecha,
        plazoConfigByTipo,
      });
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const actualizado = await loadCasoOr404(caso.id, res);
  if (!actualizado) return;
  res.status(201).json({ caso: serializeCaso(actualizado) });
});

app.post('/api/casos/:id/comite', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;

  const { fecha, decision, observaciones } = req.body ?? {};
  if (!fecha) {
    res.status(400).json({ error: 'fecha es obligatoria.' });
    return;
  }

  await prisma.comitePresentacion.create({
    data: { casoId: caso.id, fecha: new Date(fecha), decision: decision ?? null, observaciones: observaciones ?? null },
  });

  const actualizado = await loadCasoOr404(caso.id, res);
  if (!actualizado) return;
  res.status(201).json({ caso: serializeCaso(actualizado) });
});

app.post('/api/casos/:id/notas', async (req, res) => {
  if (!requireRoles(req, res, NOTA_ROLES)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;

  const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
  if (!texto) {
    res.status(400).json({ error: 'texto es obligatorio.' });
    return;
  }

  await prisma.notaCaso.create({
    data: { casoId: caso.id, autorUserId: req.authUser.id, texto },
  });

  const actualizado = await loadCasoOr404(caso.id, res);
  if (!actualizado) return;
  res.status(201).json({ caso: serializeCaso(actualizado) });
});

app.post('/api/casos/:id/derivaciones', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const caso = await loadCasoOr404(req.params.id, res);
  if (!caso) return;

  const { tipo, destino, fecha, observaciones } = req.body ?? {};
  if (!tipo) {
    res.status(400).json({ error: 'tipo es obligatorio.' });
    return;
  }

  await prisma.derivacion.create({
    data: {
      casoId: caso.id,
      tipo,
      destino: destino ?? null,
      fecha: fecha ? new Date(fecha) : new Date(),
      observaciones: observaciones ?? null,
    },
  });

  const actualizado = await loadCasoOr404(caso.id, res);
  if (!actualizado) return;
  res.status(201).json({ caso: serializeCaso(actualizado) });
});

app.patch('/api/derivaciones/:id', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const derivacion = await prisma.derivacion.findUnique({ where: { id: req.params.id } });
  if (!derivacion) {
    res.status(404).json({ error: 'Derivación no encontrada.' });
    return;
  }
  const { estado, observaciones } = req.body ?? {};
  const data = {};
  if (estado !== undefined) data.estado = estado;
  if (observaciones !== undefined) data.observaciones = observaciones;
  await prisma.derivacion.update({ where: { id: derivacion.id }, data });

  const actualizado = await loadCasoOr404(derivacion.casoId, res);
  if (!actualizado) return;
  res.json({ caso: serializeCaso(actualizado) });
});

// --- Plazos GES ------------------------------------------------------------

// Las rutas literales /api/plazos/config deben declararse ANTES de /api/plazos/:id — si no,
// Express matchea "config" como el parámetro :id y esta ruta nunca se alcanza.
app.get('/api/plazos/config', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const map = await getPlazoConfigMap();
  res.json({
    config: TIPOS_PLAZO.map((tipo) => ({ tipo, label: TIPO_PLAZO_LABELS[tipo], diasPlazoDefault: map[tipo] })),
  });
});

app.patch('/api/plazos/config', async (req, res) => {
  if (!requireRoles(req, res, ['admin'])) return;
  const { tipo, diasPlazoDefault } = req.body ?? {};
  if (!TIPOS_PLAZO.includes(tipo) || !Number.isFinite(Number(diasPlazoDefault))) {
    res.status(400).json({ error: 'tipo/diasPlazoDefault inválidos.' });
    return;
  }
  await prisma.plazoConfig.upsert({
    where: { tipo },
    update: { diasPlazoDefault: Number(diasPlazoDefault) },
    create: { tipo, label: TIPO_PLAZO_LABELS[tipo], diasPlazoDefault: Number(diasPlazoDefault) },
  });
  const map = await getPlazoConfigMap();
  res.json({ config: TIPOS_PLAZO.map((t) => ({ tipo: t, label: TIPO_PLAZO_LABELS[t], diasPlazoDefault: map[t] })) });
});

app.patch('/api/plazos/:id', async (req, res) => {
  if (!requireRoles(req, res, EDITOR_ROLES)) return;
  const plazo = await prisma.plazoGes.findUnique({ where: { id: req.params.id } });
  if (!plazo) {
    res.status(404).json({ error: 'Plazo no encontrado.' });
    return;
  }

  const { fechaLimite, fechaCumplimiento, marcarCumplido } = req.body ?? {};
  const data = {};
  if (fechaLimite !== undefined) data.fechaLimite = new Date(fechaLimite);
  if (marcarCumplido) {
    data.fechaCumplimiento = fechaCumplimiento ? new Date(fechaCumplimiento) : new Date();
    data.estado = 'cumplido';
  } else if (fechaCumplimiento !== undefined) {
    data.fechaCumplimiento = fechaCumplimiento ? new Date(fechaCumplimiento) : null;
    data.estado = fechaCumplimiento ? 'cumplido' : 'pendiente';
  }

  const actualizado = await prisma.plazoGes.update({ where: { id: plazo.id }, data });
  const caso = await loadCasoOr404(actualizado.casoId, res);
  if (!caso) return;
  res.json({ caso: serializeCaso(caso), plazo: serializePlazo(actualizado) });
});

// --- Notificaciones ------------------------------------------------------------

app.get('/api/notificaciones', async (req, res) => {
  if (!requireAuth(req, res)) return;
  await recalcularAlertas(prisma);
  const notificaciones = await prisma.notificacion.findMany({
    where: {
      OR: [
        { destinationRole: req.authUser.role },
        { userId: req.authUser.id },
        { destinationRole: null, userId: null },
      ],
    },
    include: { caso: { include: { paciente: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({
    notificaciones: notificaciones.map((n) => ({
      id: n.id,
      text: n.text,
      read: n.read,
      createdAt: n.createdAt,
      casoId: n.casoId,
      pacienteNombre: n.caso?.paciente?.nombre ?? null,
    })),
  });
});

app.patch('/api/notificaciones/:id/read', async (req, res) => {
  if (!requireAuth(req, res)) return;
  await prisma.notificacion.update({ where: { id: req.params.id }, data: { read: true } });
  res.status(204).send();
});

// --- Estático (build de producción) ------------------------------------------------------------

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, host, () => {
  console.log(`Trazabilidad oncológica escuchando en http://${host}:${port}`);
});
