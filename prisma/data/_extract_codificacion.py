import json
import openpyxl

path = r"\\10.5.192.44\Carpetas Compartidas\DDI 3\Trabajo plataforma qmt\Base de codigos quimioterapia.xlsx"
wb = openpyxl.load_workbook(path, data_only=True)


def filas_reales(ws, min_row=2):
    """Itera filas hasta encontrar la primera completamente vacía (el max_row reportado por
    openpyxl puede estar muy inflado por formato aplicado a celdas sin datos)."""
    out = []
    vacias_seguidas = 0
    for row in ws.iter_rows(min_row=min_row, values_only=True):
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in row):
            vacias_seguidas += 1
            if vacias_seguidas >= 5:
                break
            continue
        vacias_seguidas = 0
        out.append(row)
    return out


# --- GES ---
ws = wb["codificación actualizada GES"]
ges_rows = filas_reales(ws)
ges = []
for r in ges_rows:
    problema, intervencion, familia, trazadora, glosa, tipo, nfreq, periodicidad, clasif, precio = (list(r) + [None] * 10)[:10]
    if trazadora is None:
        continue
    ges.append({
        "codigo": str(trazadora),
        "problemaSalud": problema,
        "intervencionSanitaria": intervencion,
        "familia": familia,
        "glosaTrazadora": glosa,
        "tipoTrazadora": tipo,
        "frecuencia": nfreq,
        "periodicidad": periodicidad,
        "clasificacion": clasif,
        "precio2025": precio,
    })
print(f"GES: {len(ges_rows)} filas crudas -> {len(ges)} códigos válidos")

# --- PPV no GES ---
ws = wb["PPV no GES"]
ppv_rows = filas_reales(ws)
ppv = []
for r in ppv_rows:
    familia, trazadora, glosa, freqcant, frequnidad, duplicidad, intervencion, arancel = (list(r) + [None] * 8)[:8]
    if trazadora is None:
        continue
    ppv.append({
        "codigo": str(trazadora),
        "familia": familia,
        "glosaTrazadora": glosa,
        "frecuenciaCantidad": freqcant,
        "frecuenciaUnidad": frequnidad,
        "duplicidadDiaria": duplicidad,
        "intervencionSanitaria": intervencion,
        "arancel2026": arancel,
    })
print(f"PPV no GES: {len(ppv_rows)} filas crudas -> {len(ppv)} códigos válidos")

# --- DAC (lista de drogas/esquemas) ---
ws = wb["Codificación DAC"]
dac_rows = filas_reales(ws)
dac = [str(r[0]).strip() for r in dac_rows if r[0]]
print(f"DAC: {len(dac)} drogas/esquemas")

# --- LRS (tabla de enfermedad + droga + garantías) ---
ws = wb["Codificación LRS"]
lrs_rows = filas_reales(ws)
lrs = []
for r in lrs_rows:
    enfermedad, examen, garantiaConfirmacion, droga, garantiaInicio = (list(r) + [None] * 5)[:5]
    if not enfermedad and not droga:
        continue
    lrs.append({
        "enfermedad": enfermedad,
        "examenConfirmacion": examen,
        "garantiaConfirmacion": garantiaConfirmacion,
        "droga": droga,
        "garantiaInicioTratamiento": garantiaInicio,
    })
print(f"LRS: {len(lrs)} filas")

with open("prisma/data/codigos_ges.json", "w", encoding="utf-8") as f:
    json.dump(ges, f, ensure_ascii=False, indent=2)
with open("prisma/data/codigos_ppv_no_ges.json", "w", encoding="utf-8") as f:
    json.dump(ppv, f, ensure_ascii=False, indent=2)
with open("prisma/data/drogas_dac.json", "w", encoding="utf-8") as f:
    json.dump(dac, f, ensure_ascii=False, indent=2)
with open("prisma/data/codigos_lrs.json", "w", encoding="utf-8") as f:
    json.dump(lrs, f, ensure_ascii=False, indent=2)

print("\nMuestra GES[:3]:", json.dumps(ges[:3], ensure_ascii=False, indent=2))
print("\nMuestra DAC[:10]:", dac[:10])
print("\nMuestra LRS[:3]:", json.dumps(lrs[:3], ensure_ascii=False, indent=2))
