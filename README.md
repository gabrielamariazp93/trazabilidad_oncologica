# Trazabilidad Oncológica

Sistema de trazabilidad de casos oncológicos (gestión de fase/hito/plazos GES), basado en el
levantamiento del flujo oncológico del paciente (BPMN "Proceso oncológico" — Cirugía Mama).

No reemplaza la ficha clínica: registra en qué etapa del proceso está cada caso y si algún
plazo GES está por vencer, no el detalle de prestaciones clínicas.

## Stack

- Frontend: React + Vite (Tailwind vía CDN, sin build propio)
- Backend: Node.js + Express
- ORM: Prisma + Postgres (Neon)
- Auth: bearer token + sesiones en base de datos

## Arranque local

Necesitas una base Postgres (recomendado: [Neon](https://neon.tech), tiene plan gratis — puedes
crear un proyecto nuevo o, si ya tienes uno de `agendas-repo`, una base de datos adicional
dentro del mismo proyecto).

```bash
npm install
cp .env.example .env
# completa DATABASE_URL y DIRECT_URL en .env con tus credenciales de Neon
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:full
```

- Frontend: http://127.0.0.1:5183
- Backend: http://127.0.0.1:4100/api
- Healthcheck: http://127.0.0.1:4100/api/health

## Usuarios demo (password `demo123`)

- `admin@hospital.local` — Administrador
- `gestora@hospital.local` — Gestor Oncológico
- `enfermera@hospital.local` — Enfermera de Policlínico
- `admision@hospital.local` — Admisión
- `ges@hospital.local` — GES
- `oncologo@hospital.local` — Médico Oncólogo
- `farmacia@hospital.local` — Farmacia
- `enfermera.quimio@hospital.local` — Enfermera de Quimioterapia
- `lectura@hospital.local` — Lectura

## Modelo del proceso

Fases: Sospecha → Diagnóstico y Etapificación → Tratamiento → Seguimiento, cada una con un
catálogo curado de hitos (`server/lib/casos.js`). Los 4 plazos GES (confirmación diagnóstica,
etapificación, inicio de tratamiento, seguimiento) se abren y cierran automáticamente al
registrar ciertos hitos; los días por defecto de cada plazo son editables por un admin en
`/api/plazos/config` — los valores seed son solo de referencia, deben ajustarse a la normativa
vigente de cada patología.

## Módulo de Quimioterapia

Independiente del módulo de casos (comparte solo `Paciente`). Flujo: el médico oncólogo elabora
la **receta** (opcionalmente desde el catálogo de **86 esquemas** reales, o protocolo libre) →
farmacia la **valida o rechaza** → enfermería **agenda la sesión** eligiendo un sillón/horario
realmente disponible (bloques de 30 min, contra el **calendario real 2027** importado — días
hábiles, feriados, horario variable por día) → farmacia marca la **preparación** → enfermería
registra la **administración** → las estadísticas se arman agregando los ciclos administrados
(`server/lib/quimio.js`, router en `server/routes/quimio.js`).

Separación de funciones real: quien prescribe (oncólogo) no puede validar su propia receta, y
quien prepara (farmacia) no administra — cada transición de estado de un ciclo está restringida
por rol (ver `ACCIONES_CICLO` en `server/lib/quimio.js`).

Datos de referencia importados de la base de trabajo en Excel de la usuaria
(`prisma/data/esquemas.json`, `calendario_2027.json`, `sillones.json`): 86 esquemas de
quimioterapia con sus fármacos/ciclos/frecuencias, el calendario hábil 2027 completo, y los 16
sillones reales. El cálculo de cupos (`calcularBloquesLibres` en `server/lib/quimio.js`) replica
el comportamiento de la planilla "CUPOS_QMT" original pero calculando disponibilidad al vuelo en
vez de pre-generar una fila por bloque.

## Deploy en Render

El repo incluye [render.yaml](render.yaml) (mismo patrón que `agendas-repo`).

1. Crea el repo en GitHub y haz push de este proyecto.
2. En Render: **New > Blueprint**, conecta el repo — Render lee `render.yaml` solo.
3. Define en el servicio las variables `DATABASE_URL` y `DIRECT_URL` (las de tu proyecto Neon).
4. Antes o después del primer deploy, corre una sola vez desde tu máquina (apuntando al Neon de
   producción en tu `.env`):
   ```bash
   npm run db:push
   npm run db:seed
   ```
   `db:seed` solo hay que correrlo una vez — vuelve a correrlo solo si quieres resetear los datos
   demo (borra y recrea los 4 pacientes de ejemplo).
5. URL final: la que asigna Render al servicio (ej. `https://trazabilidad-oncologica.onrender.com`).

## Fuera de alcance (por ahora)

Integración con SIGTE/Trackcare, reemplazo de historia clínica.
