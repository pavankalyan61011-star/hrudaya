# Hrudaya — synthetic cath-lab cases 002–020

> All cases are synthetic. Names, MRNs, operators and lot numbers are fictional. Written by Pavan from cath-lab experience; used only to seed the demo database.
>
> Mix: 6 NSTEMI (002–007) · 5 STEMI (008–012) · 4 stable angina (013–016) · 1 unstable angina (017) · 3 diagnostic-only (018–020).
> Femoral access: 005, 012 · Two stents: 004, 014 · Drug-coated balloon: 015 · Complications: 005 (haematoma), 010 (no-reflow).

## Owner-approved data corrections (15 Oct 2026)

Applied to `scripts/seed.ts` and the live database, and logged in `docs/backlog.md`.

**Standard red flags** for the 11 discharges that had none (002, 004, 006, 007, 009, 011, 012, 014,
016, 018, 019). They are stored in this order, with each heading as its own item:

- **Go to the nearest hospital emergency department or call 108 immediately if you have:**
  - Chest pain or pressure lasting more than a few minutes, or coming back
  - Severe breathlessness
  - Fainting or collapse
  - Bleeding from the [wrist|groin] puncture site that does not stop after 10 minutes of firm pressure
  - A rapidly growing swelling at the puncture site
  - The [hand|foot] on that side becoming cold, pale, numb or very painful
- **Contact the cardiology team within a day for:**
  - Increasing pain, redness, warmth or discharge at the puncture site
  - Fever
  - Black or bloody stools, or vomiting blood (you are on [blood-thinning tablets|aspirin])

The radial cases use wrist and hand, including 006 and 016, which are left radial. 012 (femoral)
uses groin and foot. 019 says "aspirin" and the rest say "blood-thinning tablets". 018 is on no
antiplatelet, so its item has no bracket.

**PCI-2026-005:** the haematoma onset is 15:10, after sheath removal at 14:49 (it was recorded
at 13:49, before removal). Haemostasis is manual compression (it was "other", an assumption).

## PCI-2026-002 | NSTEMI
```text
64F | NSTEMI; chest pain 12 h, elevated troponin | Right radial 6F
History: hypertension, type 2 diabetes; no previous PCI.
LM normal; LAD mid 95%, TIMI II (culprit); LCX mid 30%, RCA proximal 40%, both TIMI III.
Pre-dil 2.5×15 @12 → everolimus DES 3.0×24 @14, lot SYN-DES-260002 → NC post-dil 3.25×12 @16.
Final LAD residual <10%, TIMI III. Contrast 105 mL; procedure 46 min; fluoro 9.8 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial compression band.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 2.5 OD.
Follow-up 2 weeks; rehabilitation referral, access-site care and DAPT adherence advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-003 | NSTEMI
```text
71M | NSTEMI; rest pain 6 h, elevated troponin | Right radial 6F
History: hypertension, dyslipidaemia, former smoker.
LM normal; LAD proximal 75%, LCX proximal 90% (culprit), RCA mid 30%; all TIMI III. Two-vessel disease.
LCX: pre-dil 2.5×15 @12 → zotarolimus DES 3.0×22 @14, lot SYN-DES-260003 → NC 3.25×12 @16.
Final LCX residual <10%, TIMI III. Contrast 125 mL; procedure 52 min; fluoro 12.0 min. Dr Meera Shah.
Complications: none. Haemostasis: radial band. LAD deferred for staged assessment/revascularisation planning.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; amlodipine 5 OD.
Follow-up 1 week for LAD plan; rehabilitation referral and recurrent chest-pain advice.
```

## PCI-2026-004 | NSTEMI — two stents
```text
59M | NSTEMI; recurrent pain 24 h, elevated troponin | Right radial 6F
History: diabetes, hypertension, current smoker.
LM normal; LAD mid 85%, TIMI III; LCX mild irregularities, TIMI III; RCA proximal 95%, TIMI II (culprit).
RCA: pre-dil 2.5×15 @12 → everolimus DES 3.5×24 @14, lot SYN-DES-260004A → NC 3.75×12 @16.
LAD: pre-dil 2.0×15 @12 → everolimus DES 3.0×20 @14, lot SYN-DES-260004B → NC 3.25×12 @16.
Both treated lesions residual <10%, TIMI III. Contrast 165 mL; 74 min; fluoro 17.4 min. Dr Arjun Reddy. No complications; radial band.
Discharge 72 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 2.5 OD.
Follow-up 2 weeks; smoking cessation, rehabilitation and DAPT adherence advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-005 | NSTEMI — access-site haematoma
```text
68F | NSTEMI; chest pain 10 h, elevated troponin | Right femoral 6F; radial access unsuitable on ultrasound
History: hypertension, dyslipidaemia; no anticoagulant use.
LM normal; LAD mid 40%, LCX normal, both TIMI III; RCA mid 90%, TIMI II (culprit).
Pre-dil 2.5×15 @10 → zotarolimus DES 3.0×26 @14, lot SYN-DES-260005 → NC 3.25×12 @16.
Final RCA residual <10%, TIMI III. Contrast 115 mL; procedure 49 min; fluoro 10.6 min. Dr Meera Shah.
Complication: 3-cm groin haematoma after sheath removal (sheath out 14:49; haematoma 15:10); compression and observation; haemoglobin stable, ultrasound excluded pseudoaneurysm.
Haemostasis: manual compression.
Discharge 72 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months with bleeding review; atorvastatin 80 OD; amlodipine 5 OD.
Access-site review 1 week; cardiology 2 weeks; advice on swelling, bleeding and recurrent chest pain.
```

## PCI-2026-006 | NSTEMI
```text
52M | NSTEMI; chest pain 8 h, elevated troponin | Left radial 6F
History: diabetes, dyslipidaemia; family history of premature coronary disease.
LM normal; LAD mild irregularities, RCA proximal 20%, both TIMI III; LCX mid 95%, TIMI II (culprit).
Pre-dil 2.0×15 @12 → everolimus DES 2.75×24 @14, lot SYN-DES-260006 → NC 3.0×12 @16.
Final LCX residual <10%, TIMI III. Contrast 95 mL; procedure 41 min; fluoro 8.7 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial compression band.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD.
Follow-up 2 weeks; diabetes review, rehabilitation referral and DAPT adherence advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-007 | NSTEMI
```text
76M | NSTEMI; intermittent pain 18 h, elevated troponin | Right radial 6F
History: hypertension, former smoker; independent baseline function.
LM normal; LAD proximal 30%, LCX mid 40%, both TIMI III; RCA distal 90%, TIMI II (culprit).
Pre-dil 2.0×12 @10 → zotarolimus DES 2.75×22 @14, lot SYN-DES-260007 → NC 3.0×12 @16.
Final RCA residual <10%, TIMI III. Contrast 90 mL; procedure 43 min; fluoro 9.1 min. Dr Meera Shah.
Complications: none. Haemostasis: radial compression band.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months with bleeding reassessment; atorvastatin 80 OD; amlodipine 5 OD.
Follow-up 2 weeks; rehabilitation referral, bleeding precautions and access-site advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-008 | Inferior STEMI — primary PCI
```text
62M | Inferior STEMI; symptom onset 2 h | Right radial 6F
History: current smoker, dyslipidaemia; haemodynamically stable.
LM normal; LAD mid 30%, LCX normal, both TIMI III; RCA mid 100% thrombotic occlusion, TIMI 0 (culprit).
Wire crossing → pre-dil 2.0×15 @10 → zotarolimus DES 3.5×26 @14, lot SYN-DES-260008 → NC 3.75×12 @16.
Final RCA residual <10%, TIMI III. Contrast 120 mL; procedure 44 min; fluoro 9.5 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial band. Post-PCI LVEF 50%.
Discharge 72 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD.
Follow-up 2 weeks; smoking cessation, rehabilitation and urgent recurrent chest-pain advice.
```

## PCI-2026-009 | Anterior STEMI — primary PCI
```text
55F | Anterior STEMI; symptom onset 3 h | Right radial 6F
History: diabetes, hypertension.
LM normal; LAD proximal 100% thrombotic occlusion, TIMI 0 (culprit); LCX mid 30%, RCA mid 40%, both TIMI III.
Pre-dil 2.5×15 @12 → everolimus DES 3.5×28 @14, lot SYN-DES-260009 → NC 3.75×12 @16.
Final LAD residual <10%, TIMI III. Contrast 130 mL; procedure 51 min; fluoro 11.3 min. Dr Meera Shah.
Complications: none. Haemostasis: radial band. LVEF 45%; no clinical heart failure.
Discharge 96 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 2.5 OD; bisoprolol 2.5 OD.
Follow-up 2 weeks; rehabilitation referral, medication review and repeat echocardiogram at 8–12 weeks.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-010 | Inferior STEMI — primary PCI with no-reflow
```text
67M | Inferior STEMI; symptom onset 5 h | Right radial 6F
History: diabetes, current smoker.
LM normal; LAD mid 40%, LCX mid 30%, both TIMI III; RCA proximal 100% thrombotic occlusion, TIMI 0.
Pre-dil 2.0×15 @10 → everolimus DES 3.5×28 @14, lot SYN-DES-260010 → NC 3.75×12 @16.
Complication: transient no-reflow, TIMI I; dissection excluded; intracoronary vasodilator treatment restored TIMI III.
Final residual <10%. Contrast 150 mL; procedure 65 min; fluoro 15.2 min. Dr Arjun Reddy. Radial band; LVEF 45%.
Discharge 96 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 2.5 OD; bisoprolol 2.5 OD.
Follow-up 1 week; rehabilitation referral, smoking cessation and recurrent chest-pain advice.
```

## PCI-2026-011 | Lateral STEMI — primary PCI
```text
48M | Lateral STEMI; symptom onset 90 min | Right radial 6F
History: current smoker; family history of premature coronary disease.
LM normal; LAD normal, RCA mild irregularities, both TIMI III; LCX proximal 100% occlusion, TIMI 0 (culprit).
Pre-dil 2.0×12 @10 → zotarolimus DES 3.0×22 @14, lot SYN-DES-260011 → NC 3.25×12 @16.
Final LCX residual <10%, TIMI III. Contrast 105 mL; procedure 39 min; fluoro 8.2 min. Dr Meera Shah.
Complications: none. Haemostasis: radial band. LVEF 55%.
Discharge 72 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD.
Follow-up 2 weeks; rehabilitation, smoking cessation and DAPT adherence advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-012 | Anterior STEMI — primary PCI
```text
73F | Anterior STEMI; symptom onset 4 h | Right femoral 6F; radial access unsuitable on ultrasound
History: hypertension, dyslipidaemia.
LM normal; LAD mid 100% occlusion, TIMI 0 (culprit); LCX proximal 75%, RCA mid 30%, both TIMI III. Two-vessel disease.
Pre-dil 2.0×15 @10 → everolimus DES 3.0×28 @14, lot SYN-DES-260012 → NC 3.25×12 @16.
Final LAD residual <10%, TIMI III. Contrast 135 mL; procedure 54 min; fluoro 12.1 min. Dr Arjun Reddy.
Complications: none. Manual compression after sheath removal. LVEF 45%; staged LCX assessment planned.
Discharge 96 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; ramipril 2.5 OD; bisoprolol 2.5 OD.
Follow-up 1 week to arrange LCX management; groin care, rehabilitation and DAPT adherence advice.
Red flags: standard set (groin, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-013 | Stable angina
```text
61M | Stable exertional angina despite medical therapy; anterior ischaemia on stress imaging | Right radial 6F
History: hypertension, dyslipidaemia.
LM normal; LAD proximal 85%, LCX mid 20%, RCA normal; all TIMI III.
Pre-dil 2.5×15 @12 → everolimus DES 3.5×20 @14, lot SYN-DES-260013 → NC 3.75×12 @16.
Final LAD residual <10%, TIMI III. Contrast 85 mL; procedure 38 min; fluoro 7.6 min. Dr Meera Shah.
Complications: none. Haemostasis: radial compression band.
Discharge 24 h: aspirin 75 OD + clopidogrel 75 OD, planned 6 months; atorvastatin 40 OD; amlodipine 5 OD; sublingual GTN as needed.
Follow-up 4 weeks; exercise guidance, DAPT adherence and recurrent chest-pain advice.
```

## PCI-2026-014 | Stable angina — two stents
```text
66F | Stable angina despite medical therapy; inferior and lateral ischaemia | Right radial 6F
History: hypertension, dyslipidaemia; preserved LV function.
LM normal; LAD mid 30%, LCX mid 85%, RCA mid 90%; all TIMI III. Two-vessel disease.
LCX: pre-dil 2.0×15 @12 → zotarolimus DES 2.75×22 @14, lot SYN-DES-260014A → NC 3.0×12 @16.
RCA: pre-dil 2.5×15 @12 → zotarolimus DES 3.5×26 @14, lot SYN-DES-260014B → NC 3.75×12 @16.
Both residual <10%, TIMI III. Contrast 155 mL; 69 min; fluoro 16.1 min. Dr Arjun Reddy. No complications; radial band.
Discharge 24 h: aspirin 75 OD + clopidogrel 75 OD, planned 6 months; atorvastatin 40 OD; amlodipine 5 OD; sublingual GTN as needed.
Follow-up 4 weeks; DAPT adherence, access-site care and activity advice.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-015 | Stable angina — drug-coated balloon
```text
63M | Recurrent stable angina; prior RCA DES 3 years ago; inferior ischaemia | Right radial 6F
History: diabetes, hypertension; symptoms despite medical therapy.
LM normal; LAD mid 30%, LCX normal; RCA mid focal 80% in-stent restenosis; all TIMI III.
IVUS: neointimal restenosis without significant underexpansion → scoring balloon 3.0×15 @14; residual 20%, no dissection.
Paclitaxel-coated balloon 3.0×20 @8 for 60 s, lot SYN-DCB-260015; no new stent. Final residual 20%, TIMI III.
Contrast 100 mL; procedure 48 min; fluoro 11.0 min. Dr Meera Shah. Complications: none; radial band.
Discharge 24 h: aspirin 75 OD + clopidogrel 75 OD, operator-documented 1-month plan pending review; atorvastatin 40 OD; amlodipine 5 OD.
Follow-up 4 weeks before antiplatelet change; diabetes review and recurrent chest-pain advice.
```

## PCI-2026-016 | Stable angina
```text
57F | Stable exertional angina despite medical therapy; inferior ischaemia | Left radial 6F
History: dyslipidaemia; no previous PCI.
LM normal; LAD normal, LCX mild irregularities, RCA proximal 85%; all TIMI III.
Pre-dil 2.5×15 @12 → everolimus DES 3.0×20 @14, lot SYN-DES-260016 → NC 3.25×12 @16.
Final RCA residual <10%, TIMI III. Contrast 80 mL; procedure 35 min; fluoro 7.2 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial compression band.
Discharge 24 h: aspirin 75 OD + clopidogrel 75 OD, planned 6 months; atorvastatin 40 OD; amlodipine 5 OD; sublingual GTN as needed.
Follow-up 4 weeks; activity advice, access-site care and DAPT adherence.
Red flags: standard set (wrist, blood-thinning tablets), owner correction 15 Oct 2026.
```

## PCI-2026-017 | Unstable angina
```text
60M | Crescendo angina with rest pain and transient ST depression; serial troponins negative | Right radial 6F
History: hypertension, dyslipidaemia, former smoker.
LM normal; LAD proximal 90%, LCX mid 30%, RCA mid 40%; all TIMI III.
Pre-dil 2.5×15 @12 → zotarolimus DES 3.5×22 @14, lot SYN-DES-260017 → NC 3.75×12 @16.
Final LAD residual <10%, TIMI III. Contrast 95 mL; procedure 42 min; fluoro 8.9 min. Dr Meera Shah.
Complications: none. Haemostasis: radial compression band.
Discharge 48 h: aspirin 75 OD + ticagrelor 90 BD, planned 12 months; atorvastatin 80 OD; amlodipine 5 OD.
Follow-up 2 weeks; rehabilitation referral, DAPT adherence and recurrent chest-pain advice.
```

## CAG-2026-018 | Diagnostic-only — normal coronaries
```text
46F | Persistent exertional chest discomfort; abnormal stress test | Right radial 5F
History: hypertension; no diabetes or smoking history.
LM, LAD, LCX and RCA: no angiographic stenosis; TIMI III throughout.
Diagnostic coronary angiography only; no balloon or stent.
Contrast 45 mL; procedure 22 min; fluoro 3.5 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial compression band.
Discharge same day: continue amlodipine 5 OD; no antiplatelet initiated solely for angiography.
Follow-up 4 weeks; assess persistent symptoms for microvascular/vasospastic or non-cardiac causes; access-site advice.
Red flags: standard set (wrist, no bracket on the bleeding item), owner correction 15 Oct 2026.
```

## CAG-2026-019 | Diagnostic-only — non-obstructive disease
```text
58M | Exertional chest discomfort; equivocal stress imaging | Right radial 5F
History: diabetes, dyslipidaemia, former smoker.
LM normal; LAD proximal 30%, LCX mid 20%, RCA mid 40%; TIMI III throughout.
Diagnostic coronary angiography only; no flow-limiting epicardial lesion identified; no balloon or stent.
Contrast 55 mL; procedure 25 min; fluoro 4.2 min. Dr Meera Shah.
Complications: none. Haemostasis: radial compression band.
Discharge same day: aspirin 75 OD after bleeding-risk review; atorvastatin 40 OD; continue established diabetes therapy; no DAPT.
Follow-up 4 weeks; risk-factor optimisation, symptom reassessment and access-site advice.
Red flags: standard set (wrist, aspirin), owner correction 15 Oct 2026.
```

## CAG-2026-020 | Diagnostic-only — referred for CABG
```text
69M | Stable limiting angina despite medical therapy; extensive inducible ischaemia | Right radial 5F
History: diabetes, hypertension, dyslipidaemia.
LM distal 60%; LAD proximal 90%; LCX proximal 80%; RCA mid 85%; TIMI III throughout. Left-main and three-vessel disease.
Diagnostic angiography only; complex anatomy discussed with Heart Team; CABG recommended; no balloon or stent.
Contrast 70 mL; procedure 31 min; fluoro 6.0 min. Dr Arjun Reddy.
Complications: none. Haemostasis: radial band. LVEF 50%.
Remains admitted for surgical evaluation: aspirin 75 OD, atorvastatin 80 OD, bisoprolol 2.5 OD, isosorbide mononitrate 30 OD; no P2Y12 loading.
Cardiac surgical review next day; discharge deferred pending revascularisation plan; patient counselled about findings.
```
