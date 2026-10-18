import type { ProcedureFull } from "@/lib/queries/procedures";
import { ageOn, formatDate } from "@/lib/dates";
import { label, timi } from "@/lib/labels";
import {
  NOT_RECORDED,
  formatDateTime,
  formatTime,
  guidewireText,
  lengthOfStay,
  lesionName,
  lvefText,
  measurement,
  medicationLine,
  minutesBetween,
  orNotRecorded,
  phaseHeading,
  procedureMedicationLine,
  timingHeading,
} from "@/lib/report-format";
import { Facts, Section } from "@/components/report/section";
import { SheetLink } from "@/components/report/sheets/sheet-link";
import { sheetHref } from "@/lib/sheets";

/**
 * The clinician report body, shared by the report page and the print page (Week 4 spec §8: the
 * print "matches the on-screen report exactly" — one component, so it cannot drift).
 * `print` swaps the patient's name and date of birth for initials.
 */

type Device = ProcedureFull["interventions"][number]["devices_used"][number];

const yesNo = (v: boolean | null) => (v === null ? NOT_RECORDED : v ? "Yes" : "No");
const num = (v: number | null, unit: string) => (v === null ? null : `${v} ${unit}`);
/** Enum value for display; null → "Not recorded". */
const en = (v: string | null) => (v ? label(v) : NOT_RECORDED);
const pressure = (sys: number | null, dia: number | null, unit = "mmHg") => (sys === null || dia === null ? null : `${sys}/${dia} ${unit}`);
const DESTINATION: Record<string, string> = { ward: "Ward", ccu: "CCU", icu: "ICU", day_case_recovery: "Day-case recovery", transferred: "Transferred" };
const PREVIOUS_PROCEDURES = new Set(["prior_pci", "prior_cabg"]);

function deviceLine(d: Device) {
  const size = `${d.diameter_mm} × ${d.length_mm} mm`;
  const atm = d.inflation_atm ? ` @ ${d.inflation_atm} atm` : "";
  const qty = d.quantity > 1 ? ` ×${d.quantity}` : "";
  return `${d.product_name} ${size}${atm}${qty}`;
}

function CulpritTag() {
  return (
    <>
      {" · "}
      <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-semibold text-white">Culprit lesion</span>
    </>
  );
}

/** Opens the Week 7 sheet that edits this part of the report (only when the record is editable). */
function EditLink({ href, id, children }: { href: string; id: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex justify-end print:hidden">
      <SheetLink id={id} href={href} className="inline-flex min-h-11 items-center text-sm font-medium text-sky-800 underline">
        {children}
      </SheetLink>
    </div>
  );
}

const TRI: Record<string, string> = { yes: "Yes", no: "No", not_recorded: NOT_RECORDED };
const ELLIS: Record<string, string> = { ellis_1: "Ellis I", ellis_2: "Ellis II", ellis_3: "Ellis III", ellis_3_cavity: "Ellis III (cavity spilling)" };

/** Door-to-device in minutes: derived, never stored (spec §2.10). */
function doorToDevice(door: string | null, device: string | null) {
  if (!door || !device) return null;
  const m = Math.round((Date.parse(device) - Date.parse(door)) / 60_000);
  return Number.isFinite(m) && m >= 0 ? `${m} min` : null;
}

type Physio = ProcedureFull["vessel_findings"][number]["lesion_physiology"][number];
type Imaging = ProcedureFull["vessel_findings"][number]["intravascular_imaging"][number];
const physioLine = (x: Physio) =>
  [`${label(x.index)} ${x.phase} ${Number(x.value).toFixed(2)}`, x.hyperaemic_agent && x.hyperaemic_agent !== "none" ? label(x.hyperaemic_agent) : null, x.decision ? label(x.decision).toLowerCase() : null]
    .filter(Boolean)
    .join(" · ");
const imagingLine = (x: Imaging) =>
  [
    `${label(x.modality)} ${x.phase}`,
    x.mla_mm2 !== null ? `MLA ${x.mla_mm2} mm²` : null,
    x.plaque_burden_pct !== null ? `plaque burden ${x.plaque_burden_pct}%` : null,
    x.calcium_arc_deg !== null ? `calcium arc ${x.calcium_arc_deg}°` : null,
    x.msa_mm2 !== null ? `MSA ${x.msa_mm2} mm²` : null,
    x.stent_expansion_pct !== null ? `expansion ${x.stent_expansion_pct}%` : null,
    x.malapposition ? "malapposition" : null,
    x.edge_dissection ? "edge dissection" : null,
  ]
    .filter(Boolean)
    .join(" · ");

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-700 first:mt-0">{children}</h3>;
}

/**
 * Red flags may carry heading items ending in ":" (urgency groups, owner 2026-10-15; no category
 * column yet — see backlog). A heading leads the items after it; items before any heading form a
 * group of their own.
 */
export function groupRedFlags(items: string[]) {
  const groups: { heading: string | null; items: string[] }[] = [];
  for (const it of items) {
    if (it.trim().endsWith(":")) groups.push({ heading: it, items: [] });
    else if (groups.length) groups[groups.length - 1].items.push(it);
    else groups.push({ heading: null, items: [it] });
  }
  return groups.filter((g) => g.heading || g.items.length);
}

/** "Synthetic Test Patient" → "S. T. P."; words that are not names ("001") are skipped. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ");
}

/**
 * `sheetBase`: this page's URL when the record can be edited (a draft, or a record with an open
 * amendment) — each section then offers the Week 7 sheet that edits it. Omitted on the print page and
 * for read-only records.
 */
export function ProcedureReport({ p, print = false, sheetBase }: { p: ProcedureFull; print?: boolean; sheetBase?: string }) {
  const edit = !print && sheetBase ? sheetBase : null;
  const pt = p.patient;
  const vesselById = new Map(p.vessel_findings.map((v) => [v.id, v]));
  const previous = pt?.risk_factors.filter((r) => PREVIOUS_PROCEDURES.has(r.factor)) ?? [];
  const riskFactors = pt?.risk_factors.filter((r) => !PREVIOUS_PROCEDURES.has(r.factor)) ?? [];
  const duration = minutesBetween(p.started_at, p.ended_at);
  const timings = ["pre_procedure", "intra_procedure", "post_procedure"] as const;
  const during = p.complications.filter((c) => c.onset === "intraprocedural");
  const after = p.complications.filter((c) => c.onset === "inpatient");
  const untimed = p.complications.filter((c) => c.onset === null);

  return (
    <>
      <Section title="Patient">
        {pt ? (
          <>
            <Facts
              items={
                print
                  ? [
                      // Spec §8: the printed report carries MRN and initials only — no name, no date of birth.
                      ["Patient", initials(pt.full_name)],
                      ["MRN", <span key="mrn" className="font-mono">{pt.mrn}</span>],
                      ["Age / sex", `${ageOn(pt.date_of_birth, p.procedure_date ?? pt.date_of_birth)} y · ${label(pt.sex)}`],
                    ]
                  : [
                      ["Name", pt.full_name],
                      ["MRN", <span key="mrn" className="font-mono">{pt.mrn}</span>],
                      ["Age / sex", `${ageOn(pt.date_of_birth, p.procedure_date ?? pt.date_of_birth)} y · ${label(pt.sex)}`],
                      ["Date of birth", formatDate(pt.date_of_birth)],
                    ]
              }
            />
            <SubHeading>Previous procedures</SubHeading>
            {previous.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="space-y-1">
                {previous.map((r) => (
                  <li key={r.id}>
                    {label(r.factor)}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
            <SubHeading>Risk factors</SubHeading>
            {riskFactors.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {riskFactors.map((r) => (
                  <li key={r.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                    {label(r.factor)}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>{NOT_RECORDED}</p>
        )}
      </Section>

      <Section title="Presentation and baseline">
        {edit && <EditLink id="edit-indication" href={sheetHref(edit, "indication", { tab: "indication" })}>Edit indication detail</EditLink>}
        <Facts
          items={[
            ["Indication", en(p.indication)],
            ["Urgency", en(p.urgency)],
            ["Admitted", formatDateTime(p.admitted_at)],
            ["Referring clinician", p.referring_clinician],
            ["Troponin elevated", yesNo(p.troponin_elevated)],
            ["ECG", p.ecg_findings],
            ["CCS class", p.ccs_class],
            ["NYHA class", p.nyha_class],
            ["Stress test", p.stress_test_type ? `${label(p.stress_test_type)}${p.stress_test_result ? ` — ${label(p.stress_test_result).toLowerCase()}` : ""}` : null],
            ["Cardiogenic shock", p.cardiogenic_shock ? "Yes" : "No"],
            ["Cardiac arrest before the procedure", p.cardiac_arrest_pre_procedure ? "Yes" : "No"],
            ["Previous PCI", yesNo(p.prior_pci)],
            ["Previous CABG", yesNo(p.prior_cabg)],
            ["Thrombolysis", p.thrombolysis_given ? "Yes" : "No"],
          ]}
        />
        {p.indication === "stemi" && (
          <>
            <SubHeading>STEMI times</SubHeading>
            <Facts
              items={[
                ["Symptom onset", p.symptom_onset_at ? formatDateTime(p.symptom_onset_at) : null],
                ["First medical contact", p.first_medical_contact_at ? formatDateTime(p.first_medical_contact_at) : null],
                ["Arrival (door)", p.door_at ? formatDateTime(p.door_at) : null],
                ["First device", p.device_time_at ? formatDateTime(p.device_time_at) : null],
                ["Door-to-device", doorToDevice(p.door_at, p.device_time_at)],
              ]}
            />
          </>
        )}
        <p className="mt-3 whitespace-pre-line">{orNotRecorded(p.presentation_notes)}</p>
        <SubHeading>Baseline</SubHeading>
        <Facts
          items={[
            ["Allergies", p.allergies],
            ["Creatinine", num(p.creatinine_umol_l, "µmol/L")],
            ["eGFR", num(p.egfr, "mL/min/1.73 m²")],
            ["Haemoglobin", num(p.haemoglobin_g_dl, "g/dL")],
            ["Platelets", num(p.platelets_x10e9_l, "×10⁹/L")],
            ["Blood pressure", pressure(p.baseline_bp_systolic, p.baseline_bp_diastolic)],
            ["Heart rate", num(p.baseline_heart_rate, "bpm")],
          ]}
        />
      </Section>

      <Section title="Access">
        <Facts
          items={[
            ["Access site", en(p.access_site)],
            ["Ultrasound-guided", yesNo(p.access_ultrasound_guided)],
            ["Attempts", p.access_attempts],
            ["Sheath", p.sheath_size_fr ? `${p.sheath_size_fr}F` : null],
            ["Diagnostic catheters", p.diagnostic_catheters.length ? p.diagnostic_catheters.join(", ") : null],
            ["Guiding catheter", p.guiding_catheter],
            ["Primary operator", p.operator ? `${p.operator.full_name} (${label(p.operator.role)})` : null],
            ["Sheath removed", p.sheath_removed_at ? formatDateTime(p.sheath_removed_at) : null],
          ]}
        />
      </Section>

      <Section title="Coronary anatomy">
        {edit && <EditLink id="edit-haemodynamics" href={sheetHref(edit, "haemodynamics")}>Edit haemodynamics &amp; LV</EditLink>}
        <Facts
          items={[
            ["Dominance", p.dominance ? (p.dominance === "co_dominant" ? "Co-dominant" : `${label(p.dominance)}-dominant`) : null],
            ...(p.haemodynamics?.left_status === "not_performed"
              ? ([["Left-heart pressures", "Not performed"]] as [string, React.ReactNode][])
              : ([
                  [
                    "Aortic pressure",
                    p.haemodynamics
                      ? pressure(p.haemodynamics.ao_systolic, p.haemodynamics.ao_diastolic) &&
                        `${pressure(p.haemodynamics.ao_systolic, p.haemodynamics.ao_diastolic)}${p.haemodynamics.ao_mean !== null ? ` (mean ${p.haemodynamics.ao_mean})` : ""}`
                      : pressure(p.aortic_pressure_systolic, p.aortic_pressure_diastolic),
                  ],
                  ["LV systolic", num(p.haemodynamics?.lv_systolic ?? null, "mmHg")],
                  ["LVEDP", measurement(p.lvedp_status, `${p.lvedp_mmhg} mmHg`)],
                ] as [string, React.ReactNode][])),
            ["Heart rate at measurement", num(p.haemodynamics?.heart_rate_at_measurement ?? null, "bpm")],
            ["Rhythm", p.haemodynamics?.rhythm ? label(p.haemodynamics.rhythm) : null],
            ["Mitral regurgitation", p.mitral_regurgitation_grade !== null ? `Grade ${p.mitral_regurgitation_grade}` : null],
            ["LV-gram", yesNo(p.lv_gram_performed)],
            [
              "Wall motion",
              p.lv_wall_motion.length
                ? [...p.lv_wall_motion]
                    .sort((a, b) => a.segment - b.segment)
                    .map((w) => `${w.segment} ${w.motion}`)
                    .join(", ")
                : null,
            ],
          ]}
        />
        {(p.grafts.length > 0 || p.prior_cabg === true) && (
          <>
            <SubHeading>Bypass grafts</SubHeading>
            {edit && <EditLink id="edit-grafts" href={sheetHref(edit, "grafts")}>{p.grafts.length ? "Edit grafts" : "+ Graft"}</EditLink>}
            {p.grafts.length === 0 ? (
              <p className="text-slate-600">None recorded</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {p.grafts.map((g) => (
                  <li key={g.id}>
                    <span className="font-semibold">
                      {label(g.graft_type)} to {label(g.target_vessel)}
                    </span>
                    {g.sequential ? " (sequential)" : ""} · {g.patency === "stenosed" && g.stenosis_pct !== null ? `stenosed ${g.stenosis_pct}%` : label(g.patency).toLowerCase()}
                    {g.lesion_location ? ` · ${label(g.lesion_location).toLowerCase()}` : ""}
                    {g.cabg_year ? ` · CABG ${g.cabg_year}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {p.vessel_findings.length === 0 ? (
          <p className="mt-3 text-slate-600">No findings recorded</p>
        ) : (
          <table className="mt-3 w-full table-fixed text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="w-2/5 pb-2 font-medium">Vessel</th>
                <th scope="col" className="pb-2 font-medium">Stenosis</th>
                <th scope="col" className="pb-2 font-medium">Pre-intervention TIMI flow</th>
              </tr>
            </thead>
            <tbody>
              {p.vessel_findings.map((v) => {
                const graft = v.graft_id ? p.grafts.find((g) => g.id === v.graft_id) : undefined;
                const detail = [
                  v.lesion_length_mm !== null ? `${v.lesion_length_mm} mm long` : null,
                  v.lesion_class ? `class ${label(v.lesion_class)}` : null,
                  v.ostial ? "ostial" : null,
                  v.calcification ? `${label(v.calcification).toLowerCase()} calcification` : null,
                  v.thrombus ? "thrombus" : null,
                  v.bifurcation ? (v.bifurcation_medina ? `bifurcation (Medina ${v.bifurcation_medina})` : "bifurcation") : null,
                  v.tortuosity && v.tortuosity !== "none" ? `${label(v.tortuosity).toLowerCase()} tortuosity` : null,
                  v.cto ? (v.cto_duration_months !== null ? `CTO (${v.cto_duration_months} months)` : "CTO") : null,
                  v.in_stent_restenosis ? (v.isr_pattern ? `in-stent restenosis (${label(v.isr_pattern).toLowerCase()})` : "in-stent restenosis") : null,
                  v.collaterals_rentrop !== null ? `Rentrop ${v.collaterals_rentrop} collaterals` : null,
                  v.timi_frame_count !== null ? `corrected TIMI frame count ${v.timi_frame_count}` : null,
                  v.lesion_notes,
                ].filter(Boolean);
                const name = graft ? `${label(graft.graft_type)} to ${label(graft.target_vessel)}` : lesionName(v.vessel, v.segment);
                return (
                  <tr key={v.id} id={`lesion-${v.id}`} className={`border-t border-slate-100 align-top ${v.is_culprit ? "bg-red-50" : ""}`}>
                    <td className="py-2 pr-2">
                      <span className="font-semibold">{name}</span>
                      {v.is_culprit && <CulpritTag />}
                      {detail.length > 0 && <span className="block break-words text-xs text-slate-600">{detail.join(" · ")}</span>}
                      {v.lesion_physiology.map((x) => (
                        <span key={x.id} className="block text-xs text-slate-700">{physioLine(x)}</span>
                      ))}
                      {v.intravascular_imaging.map((x) => (
                        <span key={x.id} className="block text-xs text-slate-700">{imagingLine(x)}</span>
                      ))}
                      {edit && (
                        <SheetLink
                          id={`edit-lesion-${v.id}`}
                          href={sheetHref(edit, "lesion", { row: v.id })}
                          label={`Edit lesion details: ${name}`}
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-sky-800 underline"
                        >
                          Edit lesion
                        </SheetLink>
                      )}
                      {edit && (
                        <SheetLink
                          href={sheetHref(edit, "physiology", { row: v.id, tab: "physiology" })}
                          label={`Physiology and imaging: ${name}`}
                          className="ml-3 mt-1 inline-flex min-h-11 items-center text-sm font-medium text-sky-800 underline"
                        >
                          Physiology &amp; imaging
                        </SheetLink>
                      )}
                    </td>
                    <td className="py-2">{v.stenosis_pct === 0 ? "0% (normal)" : `${v.stenosis_pct}%`}</td>
                    <td className="py-2">{timi(v.timi_flow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Intervention and devices">
        {p.interventions.length === 0 ? (
          <p className="text-slate-600">{p.procedure_type === "diagnostic_angiography" ? "Diagnostic angiography only — no intervention." : "None recorded"}</p>
        ) : (
          <div className="space-y-5">
            {p.interventions.map((iv) => {
              const v = vesselById.get(iv.vessel_finding_id);
              return (
                <div key={iv.id} className="space-y-3">
                  <h3 className="font-semibold">
                    {v ? (
                      <>
                        {lesionName(v.vessel, v.segment)}
                        {v.is_culprit && <CulpritTag />}
                      </>
                    ) : (
                      NOT_RECORDED
                    )}
                    <span className="block text-sm font-normal text-slate-700">{label(iv.intervention_type)}</span>
                  </h3>
                  {edit && <EditLink id={`edit-intervention-${iv.id}`} href={sheetHref(edit, "intervention", { row: iv.id })}>Edit intervention &amp; devices</EditLink>}
                  <Facts
                    items={[
                      ["Techniques", iv.techniques.length ? [...iv.techniques.filter((t) => t !== "other").map((t) => label(t)), ...(iv.technique_other ? [iv.technique_other] : [])].join(", ") : null],
                      ["Bifurcation strategy", iv.bifurcation_strategy ? (iv.bifurcation_strategy === "other" ? iv.bifurcation_strategy_other : label(iv.bifurcation_strategy)) : null],
                      ["Guide catheter", iv.guiding_catheter],
                      [iv.wires.length > 1 ? "Wires" : "Guidewire", iv.wires.length > 1 ? iv.wires.join(", ") : guidewireText(iv.guidewire)],
                      ["Residual stenosis", `${iv.residual_stenosis_pct}%`],
                      ["Final flow", timi(iv.timi_flow_post)],
                      ["Result", iv.success ? "Successful" : `Not successful${iv.failure_reason ? ` — ${label(iv.failure_reason).toLowerCase()}` : ""}`],
                      ["Dissection", iv.dissection ? `Yes${iv.dissection_grade ? ` (type ${label(iv.dissection_grade)})` : ""}` : "No"],
                      ["Perforation", iv.perforation ? `Yes${iv.perforation_class ? ` (${ELLIS[iv.perforation_class]})` : ""}` : "No"],
                      ["No-reflow", iv.no_reflow ? "Yes" : "No"],
                      ["Stent overlap", iv.stent_overlap ? "Yes" : null],
                      ["Total stent length", num(iv.total_stent_length_mm, "mm")],
                    ]}
                  />
                  {iv.devices_used.length > 0 && (
                    <ol className="space-y-2">
                      {(["pre_dilation", "deployment", "post_dilation", "other"] as const).flatMap((phase) =>
                        iv.devices_used
                          .filter((d) => d.phase === phase)
                          .map((d) => (
                            <li key={d.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                              <span className="block text-xs font-semibold uppercase text-slate-600">{phaseHeading(phase, d.category)}</span>
                              <span className="block break-words">{deviceLine(d)}</span>
                              {(d.lot_number || d.expiry_date) && (
                                <span className="block font-mono text-xs">
                                  {[d.lot_number ? `Lot ${d.lot_number}` : null, d.expiry_date ? `Expiry ${formatDate(d.expiry_date)}` : null]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                              {d.udi && <span className="block break-all font-mono text-xs">UDI {d.udi}</span>}
                              {d.device_inflations.length > 0 && (
                                <span className="block text-xs text-slate-700">
                                  Inflations:{" "}
                                  {[...d.device_inflations]
                                    .sort((a, b) => a.sequence - b.sequence)
                                    .map((f) => `${f.pressure_atm} atm${f.duration_s !== null ? ` ${f.duration_s} s` : ""}`)
                                    .join(" · ")}
                                </span>
                              )}
                            </li>
                          )),
                      )}
                    </ol>
                  )}
                  {iv.notes && <p className="text-sm text-slate-700">{iv.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Procedure medications">
        {p.procedure_medications.length === 0 ? (
          <p className="text-slate-600">None recorded</p>
        ) : (
          timings.map((t) => {
            const meds = p.procedure_medications.filter((m) => m.timing === t);
            if (meds.length === 0) return null;
            return (
              <div key={t}>
                <SubHeading>{timingHeading(t)}</SubHeading>
                <ul className="divide-y divide-slate-100">
                  {meds.map((m) => (
                    <li key={m.id} className="py-2">
                      <span>{procedureMedicationLine(m)}</span>
                      <span className="block text-sm text-slate-600">
                        {[
                          m.administered_at ? `Given ${formatTime(m.administered_at)}` : null,
                          m.act_seconds !== null ? `ACT ${m.act_seconds} s${m.act_measured_at ? ` at ${formatTime(m.act_measured_at)}` : ""}` : null,
                          m.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Time not recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Procedure details">
        <SubHeading>Safety</SubHeading>
        <Facts
          items={[
            ["Consent", p.consent_obtained_at ? `${p.consent_by?.full_name ?? "Clinician not recorded"}, ${formatDateTime(p.consent_obtained_at)}` : null],
            ["Time-out", p.timeout_completed_at ? `${p.timeout_by?.full_name ?? "Clinician not recorded"}, ${formatDateTime(p.timeout_completed_at)}` : null],
          ]}
        />
        <SubHeading>Procedure</SubHeading>
        <Facts
          items={[
            ["Started", formatDateTime(p.started_at)],
            ["Ended", formatDateTime(p.ended_at)],
            ["Procedure duration", duration === null ? null : `${duration} min`],
            ["Contrast", [p.contrast_agent, num(p.contrast_volume_ml, "mL")].filter(Boolean).join(", ") || null],
            ["Fluoroscopy", num(p.fluoroscopy_time_min, "min")],
            ["Cumulative air kerma (mGy)", p.air_kerma_mgy],
            ["Dose-area product (Gy·cm²)", p.dap_gy_cm2],
            ["Haemostasis", en(p.haemostasis_method)],
          ]}
        />
        <SubHeading>Final impression</SubHeading>
        <p className="whitespace-pre-line">{orNotRecorded(p.outcome_summary)}</p>
      </Section>

      <Section title="Complications">
        {edit && <EditLink id="edit-events" href={sheetHref(edit, "events")}>Edit procedural events</EditLink>}
        {p.complications.length === 0 ? (
          <p>None</p>
        ) : (
          (
            [
              ["During procedure", during],
              ["After procedure", after],
              ["Timing not recorded", untimed],
            ] as const
          ).map(([heading, list]) =>
            list.length === 0 ? null : (
              <div key={heading}>
                <SubHeading>{heading}</SubHeading>
                <ul className="space-y-2">
                  {list.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">{label(c.complication)}</span>
                      {c.grade && ` ${c.grade}`} ({label(c.severity)})
                      {c.onset_at && <span className="text-slate-700"> · {formatDateTime(c.onset_at)}</span>}
                      <span className="block">{c.management}</span>
                      {c.treatments.length > 0 && (
                        <span className="block text-sm text-slate-700">
                          Treatment: {[...c.treatments.filter((t) => t !== "other").map((t) => label(t).toLowerCase()), ...(c.treatment_other ? [c.treatment_other] : [])].join(", ")}
                        </span>
                      )}
                      {c.resolution && <span className="block text-sm text-slate-700">Resolution: {label(c.resolution).toLowerCase()}</span>}
                      {c.outcome && <span className="block text-sm text-slate-700">Outcome: {c.outcome}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )
        )}
      </Section>

      <Section title="Immediate outcome">
        <Facts
          items={[
            ["Condition", en(p.post_procedure_condition)],
            ["Destination", p.post_procedure_destination ? DESTINATION[p.post_procedure_destination] : null],
            ["LVEF", lvefText(p)],
          ]}
        />
        <SubHeading>Immediate post-procedure plan {p.ended_at && <span className="font-normal text-slate-600">· {formatDateTime(p.ended_at)}</span>}</SubHeading>
        <p className="whitespace-pre-line">{orNotRecorded(p.immediate_care_notes)}</p>
        <SubHeading>Communication</SubHeading>
        <Facts
          items={[
            ["Findings explained to patient", p.findings_communicated_to_patient_at ? formatDateTime(p.findings_communicated_to_patient_at) : null],
            ["Findings shared with team", p.findings_communicated_to_team ? "Yes" : "No"],
            ["Notes", p.communication_notes],
          ]}
        />
      </Section>

      <Section title="In-hospital outcomes">
        {edit && <EditLink id="edit-outcome" href={sheetHref(edit, "indication", { tab: "outcome" })}>Edit outcomes</EditLink>}
        {!p.in_hospital_outcomes ? (
          <p className="text-slate-600">Not recorded</p>
        ) : (
          <Facts
            items={[
              ["Periprocedural MI", TRI[p.in_hospital_outcomes.mi]],
              ["Stroke", TRI[p.in_hospital_outcomes.stroke]],
              ["Death", p.in_hospital_outcomes.death === "yes" && p.in_hospital_outcomes.death_cause ? `Yes — ${p.in_hospital_outcomes.death_cause}` : TRI[p.in_hospital_outcomes.death]],
              [
                "Bleeding",
                p.in_hospital_outcomes.bleeding === "yes" && p.in_hospital_outcomes.bleeding_barc !== null
                  ? `Yes — BARC ${p.in_hospital_outcomes.bleeding_barc}${p.in_hospital_outcomes.bleeding_barc_sub ?? ""}`
                  : TRI[p.in_hospital_outcomes.bleeding],
              ],
              ["Transfusion", TRI[p.in_hospital_outcomes.transfusion]],
              [
                "Vascular complications",
                p.in_hospital_outcomes.vascular_status === "yes"
                  ? p.in_hospital_outcomes.vascular_complications.map((x) => label(x)).join(", ")
                  : TRI[p.in_hospital_outcomes.vascular_status],
              ],
              ["Acute kidney injury", TRI[p.in_hospital_outcomes.aki]],
              ["Creatinine after", num(p.in_hospital_outcomes.creatinine_post_umol_l, "µmol/L")],
              ["New dialysis", TRI[p.in_hospital_outcomes.new_dialysis]],
              ["Emergency CABG", TRI[p.in_hospital_outcomes.emergency_cabg]],
              ["Cardiac tamponade", TRI[p.in_hospital_outcomes.cardiac_tamponade]],
              ["Unplanned repeat PCI", TRI[p.in_hospital_outcomes.unplanned_repeat_pci]],
              ["Disposition", p.in_hospital_outcomes.disposition ? label(p.in_hospital_outcomes.disposition) : null],
            ]}
          />
        )}
      </Section>

      <Section title="Discharge">
        {!p.discharge ? (
          <p className="font-medium">Not yet discharged</p>
        ) : (
          <div className="space-y-4">
            <Facts
              items={[
                ["Discharged", formatDateTime(p.discharge.discharged_at)],
                ["Length of stay", lengthOfStay(p.admitted_at, p.discharge.discharged_at)],
                ["Clinical status", p.discharge.clinical_status],
                ["Follow-up", `${formatDate(p.discharge.follow_up_date)} — ${p.discharge.follow_up_clinic}`],
              ]}
            />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">Medications</h3>
              {p.discharge.discharge_medications.length === 0 ? (
                <p className="text-slate-600">None recorded</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {p.discharge.discharge_medications.map((m) => (
                    <li key={m.id} className="py-2">
                      <span>{medicationLine(m)}</span>
                      {m.is_dapt && (
                        <>
                          {" "}
                          <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-900">DAPT</span>
                        </>
                      )}
                      {(m.duration || m.purpose) && (
                        <span className="block text-sm text-slate-600">{[m.purpose, m.duration].filter(Boolean).join(" · ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {p.discharge.dapt_planned_months !== null && (
                <p className="mt-2 font-medium">
                  DAPT plan: {p.discharge.dapt_planned_months} {p.discharge.dapt_planned_months === 1 ? "month" : "months"}
                  {p.discharge.dapt_review_date && `, review by ${formatDate(p.discharge.dapt_review_date)}`}
                </p>
              )}
            </div>
            {p.discharge.advice.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-700">Advice</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {p.discharge.advice.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
            {p.discharge.red_flags.length > 0 && (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <h3 className="text-sm font-semibold text-red-900">When to seek help</h3>
                {groupRedFlags(p.discharge.red_flags).map((g, i) => (
                  <div key={i}>
                    {g.heading && <p className="mb-1 text-sm font-semibold text-red-950">{g.heading}</p>}
                    <ul className="list-disc space-y-1 pl-5 text-red-950">
                      {g.items.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
