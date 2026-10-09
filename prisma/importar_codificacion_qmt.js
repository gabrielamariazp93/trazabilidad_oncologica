// Importa los catálogos reales de códigos GES y PPV no GES (REM) extraídos de la planilla
// "Base de codigos quimioterapia.xlsx" de la usuaria (prisma/data/_extract_codificacion.py).
// Idempotente: upsert por la clave única de cada modelo, se puede re-correr si la planilla se
// actualiza. Los JSON de entrada quedan versionados en prisma/data/ como fuente de verdad.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function leerJson(nombre) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', nombre), 'utf-8'));
}

const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10000, timeout: 30000 },
});

async function main() {
  const ges = leerJson('codigos_ges.json');
  let gesImportados = 0;
  for (const g of ges) {
    await prisma.codigoGes.upsert({
      where: { codigo_familia: { codigo: g.codigo, familia: g.familia } },
      update: {
        problemaSalud: g.problemaSalud ?? null,
        intervencionSanitaria: g.intervencionSanitaria ?? null,
        glosaTrazadora: g.glosaTrazadora ?? null,
        frecuencia: g.frecuencia ? String(g.frecuencia) : null,
        periodicidad: g.periodicidad ?? null,
      },
      create: {
        codigo: g.codigo,
        familia: g.familia,
        problemaSalud: g.problemaSalud ?? null,
        intervencionSanitaria: g.intervencionSanitaria ?? null,
        glosaTrazadora: g.glosaTrazadora ?? null,
        frecuencia: g.frecuencia ? String(g.frecuencia) : null,
        periodicidad: g.periodicidad ?? null,
      },
    });
    gesImportados++;
  }
  console.log(`Códigos GES importados/actualizados: ${gesImportados}`);

  const ppv = leerJson('codigos_ppv_no_ges.json');
  let ppvImportados = 0;
  for (const p of ppv) {
    if (!p.glosaTrazadora) continue;
    await prisma.codigoPpvNoGes.upsert({
      where: { codigo_glosaTrazadora: { codigo: p.codigo, glosaTrazadora: p.glosaTrazadora } },
      update: {
        familia: p.familia ?? null,
        intervencionSanitaria: p.intervencionSanitaria ?? null,
      },
      create: {
        codigo: p.codigo,
        glosaTrazadora: p.glosaTrazadora,
        familia: p.familia ?? null,
        intervencionSanitaria: p.intervencionSanitaria ?? null,
      },
    });
    ppvImportados++;
  }
  console.log(`Códigos PPV no GES importados/actualizados: ${ppvImportados}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
