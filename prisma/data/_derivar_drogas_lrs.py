import json
import re

lrs = json.load(open("prisma/data/codigos_lrs.json", encoding="utf-8"))

drogas = set()
for row in lrs:
    droga = row.get("droga") or ""
    # Separa celdas con varias drogas: " o ", " y/o ", "/", "•", salto de línea, "+".
    partes = re.split(r"\s+o\s+|\s+y/o\s+|/|•|\n|\+", droga)
    for p in partes:
        p = p.strip(" .-")
        # Filtra frases largas que no son nombres de droga (descripciones de dispositivos, etc.)
        if p and len(p) < 40 and not any(w in p.lower() for w in ["dispositivo", "implante", "bomba", "fórmula", "inmunoglobulina", "dispositivos", "generador", "inhibidor de c1"]):
            drogas.add(p)

drogas_lista = sorted(drogas)
print(f"{len(drogas_lista)} nombres de droga LRS derivados:")
for d in drogas_lista:
    print(" -", d)

with open("prisma/data/drogas_lrs.json", "w", encoding="utf-8") as f:
    json.dump(drogas_lista, f, ensure_ascii=False, indent=2)
