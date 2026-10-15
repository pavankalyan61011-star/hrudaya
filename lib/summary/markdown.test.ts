import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "./markdown.ts";

const plain = (s: string) => [{ text: s, bold: false }];

test("headings, paragraphs joined across lines, lists, and a table with a header", () => {
  const blocks = parseMarkdown(`## మీ మందులు
Take these
every day.

- Stop smoking
- Walk daily

| Drug | Dose |
|---|---|
| Aspirin (DAPT) | 75 mg |
| GTN | |

1. First
2. Second`);
  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: plain("మీ మందులు") },
    { type: "paragraph", text: plain("Take these every day.") },
    { type: "list", ordered: false, items: [plain("Stop smoking"), plain("Walk daily")] },
    { type: "table", head: [plain("Drug"), plain("Dose")], rows: [[plain("Aspirin (DAPT)"), plain("75 mg")], [plain("GTN"), []]] },
    { type: "list", ordered: true, items: [plain("First"), plain("Second")] },
  ]);
});

test("bold is the only inline markup; HTML stays text", () => {
  assert.deepEqual(parseInline("Take **Aspirin** <script>x</script>"), [
    { text: "Take ", bold: false },
    { text: "Aspirin", bold: true },
    { text: " <script>x</script>", bold: false },
  ]);
});

test("CRLF input and a table without a separator", () => {
  const blocks = parseMarkdown("| a | b |\r\n| c | d |\r\n");
  assert.deepEqual(blocks, [{ type: "table", head: [], rows: [[plain("a"), plain("b")], [plain("c"), plain("d")]] }]);
});
