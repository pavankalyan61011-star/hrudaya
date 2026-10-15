# Hrudaya — Week 5 Spec: Reviewer experience (structured editor + compare with record)

> Goal: a clinician can review an AI discharge-summary draft **section by section, against the record it came from**, on a phone, without touching Markdown. Audit flags appear beside the section that caused them. Nothing about generation, audit rules, approval rules or the database changes.
> Why: the Week 4 live review found that editing one medicine meant scrolling a long Markdown document, and that checking doses and dates against the record meant switching screens. Both are review-time friction, and review is where safety happens.

Drop this at `docs/week5-reviewer-spec.md`. Read `docs/week4-ai-summary-spec.md` §5–§7 first; the audit (`lib/summary/audit.ts`) and the summary input (`lib/summary/input.ts`) are reused unchanged.

---

## 0. Why this week matters (read this, Pavan)

Weeks 1–4 made the system *correct*. Week 5 makes it *reviewable*. A guard that a tired clinician can't use at 7 pm on a phone is not a guard. Three ideas, all of which you can say in an interview:

1. **The record is the source of truth; the leaflet is a view of it.** So the medicines table in the editor is *not editable* — it is rendered from the record. If a dose is wrong, you fix the record (reopen the procedure), not the leaflet. That removes a whole class of error the audit used to have to catch.
2. **Review against, not review alone.** Every section of the draft sits next to the record fields that fed it. On a phone that is a toggle; on a laptop it is a second column.
3. **Flags belong where the problem is.** An audit flag now says *which section* it came from, and the section is outlined red. The clinician never searches.

Interview line: *"We stopped letting people edit the data in the leaflet. They edit the wording; the numbers come from the record."*

---

## 1. What Week 5 delivers

1. **Draft parser/serialiser** `lib/summary/sections.ts`: Markdown ⇄ `{ sections[], medicines[] }`, lossless for every draft the system has produced.
2. **Structured editor** on the report page, replacing the single textarea: one editable block per section; medicines table rendered read-only from the record.
3. **Compare with record** panel: the summary input rendered readably, aligned to sections; second column on ≥1024 px, bottom sheet with a toggle on phones.
4. **Flags beside sections**: audit output mapped to section index; section outlined, flag text under it; the summary banner keeps the totals.
5. **Missing-information display** in the record panel: `Not recorded` / `Not performed` / `None recorded`, never an empty cell.
6. **Read-only Markdown view** (collapsible) for anyone who wants to see exactly what will be stored.
7. **Tests** (§8) and **docs** (`docs/reviewer-ux.md`, README section, spec corrections as usual).

Not in Week 5: editing the record from the editor (reopen flow exists already), regenerating a single section, any change to prompt/audit rules/approval rules/schema, form navigation for the capture steps (stays on the backlog), new languages, any AI call.

---

## 2. Stack additions

None. No new dependency. No migration. `approved_text` stays Markdown — the editor serialises back to the same Markdown the prompt produces, so the print page, the audit and the database see no difference.

---

## 3. Section model (`lib/summary/sections.ts`)

The prompt (v6, frozen) produces a fixed heading order with `##` headings in the target language, and one Markdown table in the medicines section. The parser relies only on structure, not on heading text:

```ts
type DraftSection = {
  key: 'why' | 'done' | 'found' | 'pump' | 'medicines' | 'care' | 'urgent' | 'followup' | 'team';
  heading: string;        // as written by the model, in the target language
  body: string;           // Markdown body of the section, excluding the medicines table
  present: boolean;       // false when the prompt legitimately omitted the section (no LVEF, no red flags)
};
type ParsedDraft = { sections: DraftSection[]; medicinesTable: string | null; preamble: string };
```

- `parseDraft(markdown): ParsedDraft` — splits on `## ` headings in order; the n-th heading maps to the n-th *present* key. Which keys are present is decided from the **summary input**, not from the text: `pump` present iff LVEF recorded; `urgent` present iff red flags non-empty. If the heading count does not match the expected present count, parsing falls back to `sections = [{key:'unknown', heading:'', body: wholeText}]` and the UI shows the old single-textarea editor with a notice. Never throw.
- `serialiseDraft(parsed): string` — reassembles `## heading\n\nbody` in order, re-inserting the medicines table exactly as parsed. **Round-trip must be byte-identical** for every draft (test §8).
- The medicines table is parsed but **never edited**: the editor renders the record's `medications[]` (from `buildSummaryInput`) in a table with the frequency/duration text taken from the draft's table rows, matched by drug name. If a row cannot be matched, show the draft's row verbatim and a warning flag `medicine_row_unmatched` (new, warning severity, UI-only — not added to `audit.ts`).

---

## 4. Editor (replaces the textarea in §7 of the Week 4 spec)

Layout, top to bottom, inside the existing Discharge summary card:

- Existing red *AI draft — not reviewed* banner and the existing audit summary line (unchanged).
- **Sections**, in order. Each is a card: heading (read-only, shown as the model wrote it), a `textarea` auto-sized to its body, and under it the flags that map to this section (§6). A section with an error flag has a red left border; warnings amber. `pump` / `urgent` sections that are not present are shown as a single muted line: *"Not in this leaflet — no LVEF recorded"* / *"— no red flags recorded"*. Not editable, not addable (fix the record).
- **Medicines** card: read-only table from the record (drug, dose, unit, frequency as the draft wrote it, duration as the draft wrote it, DAPT mark), plus one muted line: *"Medicines come from the record. To change a dose, reopen the procedure."* The DAPT sentence that follows the table in the draft is part of the `medicines` section body and *is* editable.
- Existing **Approving clinician** select, **Approve and save**, **Save edit**, **Cancel** — unchanged behaviour. Approve re-runs the audit on the serialised Markdown server-side exactly as today (422 on error flags).
- **View Markdown** (collapsible, read-only, monospace): the serialised text. Any difference between it and what will be saved is a bug.

Keyboard: Tab moves between section textareas in order. Phone: textareas full width, 16 px font minimum, no horizontal scroll (test with the longest Kannada draft).

---

## 5. Compare with record

A **Record** panel rendered from `buildSummaryInput(loaded)` — the exact object the model saw, nothing more — formatted for reading, grouped to match the sections:

| Section | Record fields shown |
|---|---|
| why | indication, urgency, admitted date |
| done | access site/side/sheath, each intervention (vessel, type, residual %, final TIMI), each device (category, name, size) |
| found | each vessel finding (vessel, stenosis %, TIMI) |
| pump | LVEF value, or `Not recorded` / `Not performed` |
| medicines | each medication row |
| care | `advice[]` items |
| urgent | `red_flags[]` items (with the heading items shown as group labels) |
| followup | follow-up date, clinic, DAPT planned months, DAPT review date |
| team | operator, facility, cath lab |
| complications (shown under *done*) | name, onset, outcome text — or `None recorded` |

Missing values: a field the input omitted (null in the record) prints `Not recorded`; a three-state measurement prints its state; an empty list prints `None recorded`. Never a blank cell, never a dash.

Layout: ≥1024 px — two columns, draft left (60 %), record right (40 %), each record group **sticks beside its section** as the page scrolls (CSS `position: sticky` within the section row; no JS scroll-sync). <1024 px — a fixed **Compare with record** button at the bottom; tapping opens a bottom sheet (≈70 % height, scrollable, close button, trap focus) showing the record group for the section the user last focused, with the other groups collapsible below it. The toggle state is remembered per session only (`sessionStorage`, wrapped in try/catch).

The panel is read-only and shows only what the model saw. If the stored `input_hash` no longer matches a fresh hash of the record (Week 4 spec §4), the panel header shows *"Record changed since this draft — regenerate"* in amber; this already exists on the card and is reused.

---

## 6. Flags beside sections

`auditDraft` is unchanged and still runs on the whole Markdown. Add a pure helper `lib/summary/flag-locations.ts`:

```ts
locateFlags(parsed: ParsedDraft, flags: AuditFlag[]): Map<sectionKey | 'global', AuditFlag[]>
```

Rules: a flag whose `detail` quotes a token (number, drug name, phrase) is attached to the **first section whose body or the medicines table contains that token**; `drug_missing` goes to `medicines`; `section_missing` / `section_extra` / `too_long` / `script_check` go to `global` (shown under the banner as today); anything unmatched goes to `global`. Client-side, the audit is re-run on every edit (debounced 400 ms) exactly as today; only the placement is new.

---

## 7. Print page and approval

No change. `approved_text` is the serialised Markdown; the print page renders it as before. The approval line stays as corrected on 15 Oct ("Drafted with AI assistance (prompt vN); checked and approved by the clinician named."). No vendor or model name anywhere a patient or clinician looks (rule recorded in the Week 4 corrections; a test exists).

---

## 8. Definition of done

- [ ] `parseDraft` → `serialiseDraft` is byte-identical for every draft in `tmp/summaries*/` (all versions, all languages) and for every approved/draft row in the local database — a script reports any mismatch and the test fails on one.
- [ ] Fallback path tested: a draft with a wrong heading count shows the single-textarea editor with the notice, and can still be approved.
- [ ] `locateFlags` unit-tested: a dose error lands on `medicines`, an invented number in the findings lands on `found`, `section_extra` stays global.
- [ ] Editor at phone width: all six languages, the longest draft of each, no horizontal scroll, textareas ≥16 px, Compare sheet opens/closes with keyboard and touch.
- [ ] Record panel shows `Not recorded` / `Not performed` / `None recorded` correctly for CAG-2026-018 (no LVEF, no complications) and PCI-2026-005 (complication with outcome).
- [ ] Approve path unchanged: 422 on an error flag, immutable after approval (existing tests still pass, none weakened).
- [ ] `docs/reviewer-ux.md`: the three ideas in §0, screenshots (laptop two-column, phone sheet), the parser rules, the flag-placement rules. README "Week 5 — Reviewer experience" section.
- [ ] Owner read-through: Pavan approves one Telugu draft in the new editor on his phone without opening the Markdown view.

## 9. Claude Code prompt

```
Read docs/week5-reviewer-spec.md, then docs/week4-ai-summary-spec.md §5–§7. No schema change, no new dependency, no change to lib/summary/prompt.ts, audit.ts, generate.ts or the API routes' rules. Build Week 5 in this order, committing after each step, pushing at the end:

1. lib/summary/sections.ts (parseDraft, serialiseDraft) per §3, with presence decided from the summary input. Write scripts/summary-roundtrip.ts + npm run summary:roundtrip that checks byte-identical round-trip over every file in tmp/summaries*/ and every discharge_summaries row in the local database; make the unit test run the same check over the saved fixtures. Fix the parser until zero mismatches. Report the count.
2. lib/summary/flag-locations.ts per §6 with tests per §8.
3. The structured editor per §4 replacing the textarea; medicines table read-only from the record; fallback to the old textarea when parsing fails; View Markdown collapsible. Client-side audit re-run on edit as today, flags placed per §6. Approve/Save/Cancel behaviour unchanged.
4. Compare with record per §5: record panel from buildSummaryInput, two-column ≥1024 px with sticky groups, bottom sheet below with the toggle; missing-value wording exactly as §5.
5. Phone-width checks per §8 across all six languages with the longest draft each; fix wrapping.
6. docs/reviewer-ux.md, README Week 5 section, spec Corrections section for anything you had to change, backlog updated (form navigation for capture steps stays listed).

When done give me: the round-trip count, the flag-placement test list, two screenshots (laptop, phone), and a phone test list. No AI calls are needed this week; if you find you need one, stop and ask.
```

## 10. Pavan's week

- Day 1: paste the prompt. While it builds, write the §0 three ideas in your own words — that's the interview answer to "how do you keep clinicians in the loop without slowing them down?"
- Day 2: phone test with the list Claude Code gives you. Approve one Telugu draft in the new editor without opening Markdown. Note anything that made you hesitate — hesitation is the bug.
- Day 3: show it to one cath lab clinician you know (even on a video call). Ask them to review one draft and say out loud what they're checking. Write down what they looked at that the Record panel didn't show. That list is Week 6.
- Day 4: ABDM — credentials should be here by now; if not, escalate on the sandbox portal. Week 3 spec is ready the day they arrive.
- Day 5: no video this week. One LinkedIn post with the two screenshots (laptop and phone) and the line from §0. Send me the text first.
