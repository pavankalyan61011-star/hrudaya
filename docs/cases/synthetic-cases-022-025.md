# Hrudaya — synthetic cath-lab cases 022–025 (Week 7)

> All cases are synthetic. Names, MRNs, operators and lot numbers are fictional. Added for the Week 7
> structured-reporting scenarios (spec §6) that no case in 001–020 has, so those stories stay as
> reviewed (owner, 18 Oct 2026). Seeded by `scripts/seed.ts` (`W7_CASES`); on production since
> 18 Oct 2026 (`npm run seed -- --cases PCI-2026-022,PCI-2026-023,PCI-2026-024,PCI-2026-025`).
>
> 022 post-CABG graft PCI · 023 bifurcation, provisional + POT + kissing · 024 POBA only, femoral
> bleed with transfusion (BARC 3a), contrast-associated AKI · 025 perforation → covered stent and
> pericardiocentesis for tamponade.

## PCI-2026-022 | Unstable angina — post-CABG, SVG PCI
```text
71M | Unstable angina; CABG 2014 (LIMA-LAD, SVG-OM1) | Right radial 6F, 6F MPA guide
History: hypertension, diabetes, dyslipidaemia. No previous PCI.
LM normal; native LAD proximal 100% (grafted), LCX proximal 90% (grafted), RCA mid 40%.
Grafts: LIMA-LAD patent. SVG-OM1 body 85%, TIMI III (culprit).
SVG: pre-dil 3.0×15 @12 → everolimus DES 3.5×18 @14, lot SYN-DES-260022 → NC 3.75×12 @16.
Final graft residual <10%, TIMI III. Contrast 140 mL; 62 min; fluoro 16.8 min. Dr Arjun Reddy. No complications; radial band.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 5 OD; metoprolol 25 BD.
Follow-up 2 weeks. Outcomes: none (all recorded "no"); disposition home.
```

## PCI-2026-023 | Stable angina — LAD/D1 bifurcation, provisional strategy
```text
64M | Stable angina CCS III despite two anti-anginals; anterior ischaemia | Right radial 6F, 6F EBU 3.5 guide
History: hypertension, dyslipidaemia, former smoker. No previous PCI or CABG.
LM normal; LAD proximal 85% at D1 (Medina 1,1,1), mild calcification, lesion 20 mm; D1 ostium 70%; LCX mid 20%; RCA normal.
Both branches wired. Pre-dil 2.5×15 @12 (15 s) → everolimus DES 3.5×24 @14 (20 s) across D1, lot SYN-DES-260023
→ POT NC 4.0×8 @18 (10 s) → kissing: NC 3.5×12 @12 (LAD) + SC 2.5×12 @10 (D1), 10 s.
LAD residual <10%, D1 ostium 30%, TIMI III both. Contrast 160 mL; 70 min; fluoro 18.4 min. Dr Meera Shah. No complications.
Discharge 24 h: aspirin 75 OD + clopidogrel 75 OD, planned 6 months; atorvastatin 80 OD; amlodipine 5 OD; sublingual GTN as needed.
Follow-up 4 weeks. Outcomes: none; disposition home.
```

## PCI-2026-024 | NSTEMI — CKD, small-vessel POBA; femoral bleed; contrast AKI
```text
78F | NSTEMI; chest pain 8 h, elevated troponin; CKD stage 3b (creatinine 128 µmol/L) | Radial spasm → right femoral 6F
History: hypertension, diabetes. No previous PCI or CABG.
LM normal; LAD mid 30%, LCX mid 40%, OM2 mid 90% in a 2.0-mm vessel (culprit), RCA mid 30%.
OM2: balloon angioplasty only, 2.0×15 (8 atm 30 s, 10 atm 30 s) — vessel below the smallest available stent.
Final residual 30%, TIMI III. Contrast kept to 60 mL; 46 min; fluoro 9.8 min. Dr Arjun Reddy. Manual compression.
Events: femoral haematoma 6 h after sheath removal, haemoglobin 11.2 → 7.4 g/dL, one unit of red cells (BARC 3a);
creatinine 128 → 196 µmol/L on day 2 (contrast-associated AKI), intravenous fluids, 150 at discharge; no dialysis.
Discharge 120 h: aspirin 75 OD + clopidogrel 75 OD, 6 months with bleeding review; atorvastatin 40 OD; amlodipine 5 OD.
Follow-up 1 week with kidney function test. Outcomes: bleeding (BARC 3a), transfusion, vascular (haematoma), AKI; disposition home.
```

## PCI-2026-025 | Stable angina — perforation, covered stent, tamponade
```text
69M | Stable angina CCS II; positive stress echo | Right radial 7F, 7F EBU 3.5 guide
History: hypertension, dyslipidaemia, current smoker (30 pack-years). No previous PCI or CABG.
LM normal; LAD mid 90%, heavily calcified, lesion 26 mm (class C); LCX mid 30%; RCA mild irregularities.
NC 2.5×12 @18 → everolimus DES 3.0×28 @14, lot SYN-DES-260025 → NC 3.5×12 @20: Ellis III perforation.
Prolonged balloon inflation (6 atm, 5 min) → covered stent 3.0×16 @14, lot SYN-CS-260025: sealed.
Pericardial effusion with hypotension → pericardiocentesis, 250 mL; drain out at 24 h; no reaccumulation at 48 h.
Final TIMI III. Contrast 210 mL; 95 min; fluoro 28.5 min. Dr Meera Shah. CCU.
Discharge 120 h: aspirin 75 OD + clopidogrel 75 OD, 6 months; atorvastatin 80 OD; ramipril 2.5 OD.
Follow-up 1 week with repeat echo. Outcomes: cardiac tamponade (linked to both events), bleeding BARC 3b; disposition home.
```
