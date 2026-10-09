// Propone (sin guardar nada todavía) la relación esquema <-> código PPV no GES, SOLO por
// coincidencia EXACTA y sin ambigüedad de nombre normalizado — nada de "contiene" (eso generaba
// falsos positivos peligrosos, ej. "DECAPEPTYL" calzaba con "CAP" por simple substring). Lo que
// no calce exacto y único queda sin vincular — se asigna a mano desde el formulario, como ya
// se puede hoy.
import fs from 'fs';

const esquemas = Object.keys(JSON.parse(fs.readFileSync('prisma/data/esquemas.json', 'utf-8')));
const ppv = JSON.parse(fs.readFileSync('prisma/data/codigos_ppv_no_ges.json', 'utf-8'));

function quitarTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function baseEsquema(nombre) {
  let n = quitarTildes(nombre).toUpperCase().trim();
  n = n.replace(/\//g, ' - '); // "GMC/DOCETAXEL" -> "GMC - DOCETAXEL", para comparar contra el formato de PPV
  // Aplica el stripping de sufijos de dosis/ciclo/día repetidamente (ej. "FOLFOX 4 D1" necesita
  // sacarse "D1" y luego "4" en dos pasadas) hasta que no cambie más.
  let prev;
  do {
    prev = n;
    n = n.replace(/\s+(C\d+(\s+O\s+MAS)?|D\d+(,D\d+)*|\d+\s*MG|PS|SC|EV\s*\d*\s*DIAS?|\d+)$/, '').trim();
  } while (n !== prev);
  return n.replace(/\s+/g, ' ');
}

function basePpv(familia) {
  let n = quitarTildes(familia).toUpperCase().trim();
  const idxParen = n.indexOf('(');
  if (idxParen > 0) n = n.slice(0, idxParen).trim();
  n = n.replace(/\*+$/, '').trim();
  return n.replace(/\s+/g, ' ');
}

const ppvConBase = ppv.map((p) => ({ ...p, base: basePpv(p.familia) }));

const matches = [];
const sinMatch = [];

for (const nombreEsquema of esquemas) {
  const base = baseEsquema(nombreEsquema);
  const candidatos = ppvConBase.filter((p) => p.base === base);
  if (candidatos.length === 1) {
    matches.push({ esquema: nombreEsquema, base, codigoPpv: candidatos[0].codigo, familiaPpv: candidatos[0].familia });
  } else {
    sinMatch.push({ esquema: nombreEsquema, base, candidatos: candidatos.length });
  }
}

console.log(`=== Coincidencias EXACTAS y únicas: ${matches.length}/${esquemas.length} ===`);
matches.forEach((m) => console.log(`${m.esquema}  ->  ${m.codigoPpv} ${m.familiaPpv}`));

console.log(`\n=== Sin vincular (${sinMatch.length}): ambiguo o sin coincidencia exacta ===`);
sinMatch.forEach((m) => console.log(`${m.esquema}  (base: "${m.base}", candidatos: ${m.candidatos})`));

fs.writeFileSync('prisma/data/esquema_ppv_mapeo.json', JSON.stringify(matches, null, 2), 'utf-8');
