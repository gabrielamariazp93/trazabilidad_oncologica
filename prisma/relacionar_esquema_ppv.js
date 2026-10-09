// Aplica la relación esquema <-> código PPV no GES propuesta en
// prisma/data/esquema_ppv_mapeo.json (prisma/data/_analizar_relacion_esquema_ppv.js) —
// solo coincidencias exactas y sin ambigüedad de nombre. Idempotente.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const propuesta = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'esquema_ppv_mapeo.json'), 'utf-8'));

const prisma = new PrismaClient();

async function main() {
  let aplicados = 0;
  for (const m of propuesta) {
    const codigoPpv = await prisma.codigoPpvNoGes.findFirst({ where: { codigo: m.codigoPpv, glosaTrazadora: m.familiaPpv } });
    if (!codigoPpv) {
      console.log(`Código PPV no encontrado para ${m.esquema} (${m.codigoPpv}), se omite.`);
      continue;
    }
    await prisma.esquemaQuimio.update({ where: { nombre: m.esquema }, data: { codigoPpvId: codigoPpv.id } });
    console.log(`${m.esquema} -> ${codigoPpv.codigo} ${codigoPpv.glosaTrazadora}`);
    aplicados++;
  }
  console.log(`\nRelaciones aplicadas: ${aplicados}/${propuesta.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
