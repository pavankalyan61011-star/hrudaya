# Reviewer experience (Week 5)

A clinician reviews an AI discharge-summary draft **section by section, against the record it
came from**, on a phone, without touching Markdown. Nothing about generation, the audit rules,
approval or the database changed this week. Spec: [week5-reviewer-spec.md](week5-reviewer-spec.md).

## Three ideas

1. **The record is the source of truth; the leaflet is a view of it.** The medicines table in the
   editor is not editable. It is rendered from the record, with the draft's wording for "how
   often" and "for how long". A wrong dose belongs in the record, not the leaflet, which removes
   a whole class of error the audit used to have to catch. Under the table the editor says:
   *"Medicines come from the record. To change a dose, amend the procedure."* (amendments: Week 6, `docs/amendments.md`).
2. **Review against, not review alone.** Every section sits next to the record fields that fed it:
   a second column on a laptop, a bottom sheet on a phone.
3. **Flags belong where the problem is.** An audit flag sits under the section that caused it, and
   the section is outlined red (error) or amber (warning). The totals stay at the top.

*"We stopped letting people edit the data in the leaflet. They edit the wording; the numbers come
from the record."*

## What it looks like

Laptop (≥ 1024 px): the draft on the left (60 %), the record on the right (40 %). Each record
group stays beside its section as the page scrolls. The example is PCI-2026-005, where the
complication and its outcome appear on both sides.

![Laptop: two columns, draft and record](images/week5-laptop-compare.png)

Phone (< 1024 px): **Compare with record** opens a bottom sheet with the record group for the
section last touched first, and the other groups folded below. The example is CAG-2026-018:
diagnostic only, so "None recorded" for interventions, devices and complications.

![Phone: the Compare with record sheet](images/week5-phone-compare.jpg)

The pane that took these captures at most 800 × 500 on a laptop layout, so the laptop image is
small. The phone image is full resolution.

## How it works

| Piece | File |
|---|---|
| Markdown ⇄ sections, lossless | `lib/summary/sections.ts` (`parseDraft`, `serialiseDraft`) |
| Where each flag goes | `lib/summary/flag-locations.ts` (`locateFlags`) |
| The editor | `components/report/summary-editor.tsx` |
| Record panel and phone sheet | `components/report/record-panel.tsx`, `components/report/compare-sheet.tsx` |
| Round-trip check | `npm run summary:roundtrip` (`scripts/summary-roundtrip.ts`) |

`approved_text` is still Markdown. The editor serialises back to exactly the Markdown the prompt
produced, so the print page, the audit and the database see no difference. **View Markdown** shows
the exact text that will be saved.

### Parser rules

- The n-th `## ` heading maps to the n-th **present** section, in the prompt's order: why, done,
  found, pump, medicines, care, urgent, follow-up, team. The parser never reads heading text,
  because headings are in the patient's language.
- Which sections are present comes from the **record**, the same rule the audit uses:
  - `pump` when an LVEF is recorded;
  - `care` when there is advice;
  - `urgent` when there are red flags.

  This is necessary, not a convenience. "LVEF but no red flags" and "red flags but no LVEF" both
  give 8 headings, and only the record can tell them apart. A control that guessed from the
  heading count mapped only 30 of 114 drafts correctly.
- A heading count that does not match the record means **fallback**: one plain textarea with a
  notice ("This draft's sections do not match the record…"). It can still be approved. The parser
  never throws.
- **Lossless.** Each section keeps every character after its heading line. The medicines table is
  cut out of the medicines body and put back at the same offset. Editing replaces only the trimmed
  text, keeping the whitespace around it, so an edit and its undo give back the original bytes.
- **Round-trip result:** 833 of 833 texts byte-identical, 0 mismatches:
  - every saved eval draft (v1–v6, 798 files);
  - every `discharge_summaries` text in production (16, from 13 rows);
  - every text in the local database (19, from 17 rows, including two approved during
    testing).

  Fallbacks:
  - 37 v1 drafts (the same 37 the audit flagged `section_extra`);
  - one production draft (CAG-2026-018 te v1, written before the red-flag correction);
  - the planted local test (its draft and its approved text).

  A deliberately broken serialiser is caught every time. The unit test runs the same check on
  committed fixtures (`lib/summary/__fixtures__/drafts`).

### Flag-placement rules

`auditDraft` is unchanged and still runs on the whole text. `locateFlags` only decides where each
flag is shown:

| Flag | Placed on |
|---|---|
| `drug_missing`, `dose_mismatch`, `medicine_row_unmatched` (UI only) | Medicines |
| `section_missing`, `section_extra`, `too_long`, `script_check` | Global (top of the editor) |
| `drug_extra`, `number_unknown`, `forbidden_phrase` | The first section, in document order, whose text (or, for medicines, the table) contains the quoted token; global if none does |
| Anything else, or any flag on a fallback draft | Global |

Numbers match whole: "5" is not found inside "15". The audit re-runs 400 ms after the last edit.
Until it has caught up, **Approve and save** stays disabled, and the server re-audits on approval
as before (422 on an error).

### Record panel

What the model saw (`buildSummaryInput`), grouped by section. A missing value is never blank:
- a field the record does not have reads `Not recorded`;
- LVEF reads its state (`Not recorded` / `Not performed`);
- an empty list reads `None recorded`.

Two additions:
- **"Record changed since this draft — regenerate"** in amber, when the draft's stored input hash
  no longer matches the record.
- If the record has a complication with no outcome text, which therefore never reached the
  model, the panel says so rather than claiming "None recorded".

## What was tested

- **Unit:** 10 parser tests and 15 flag-placement tests (listed in the README), alongside the
  existing suite; 119 pass.
- **Browser, local stack, saved v6 drafts** (no model call):
  - an unedited draft's View Markdown hashes identical to the stored text;
  - an invented number typed into "What we found" disables Approve at once, then shows under
    that section with a red border;
  - the server returns 422 for that text;
  - deleting it restores the original bytes;
  - a wording edit approved through the UI is saved byte-identical to View Markdown;
  - a fallback draft shows the notice and approves.
- **Laptop (1440):** card 1152 px, columns 661/441, record group sticks at 64 px, no horizontal
  overflow.
- **Phone (390):** each language on its longest v6 draft (en/te/ta/kn: PCI-2026-012, hi:
  PCI-2026-006, ml: PCI-2026-009). Results:
  - page width 390, nothing past the right edge;
  - every textarea 16 px with nothing clipped;
  - the sheet opens, and closes with Escape;
  - focus stays inside the sheet for 12 Tab and 12 Shift+Tab;
  - Escape returns focus to the button.

  A control element wider than the screen was detected, so the zero is real.
- **Not tested here:** a real phone (touch scrolling inside the sheet, the on-screen keyboard over
  a textarea). That is on the phone test list.
