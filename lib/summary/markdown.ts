/**
 * The small Markdown subset a summary uses — headings, paragraphs, lists, one table, **bold** —
 * parsed into blocks that React renders as elements. No HTML is ever produced or injected, so a
 * draft cannot carry markup into the page. Anything unrecognised is kept as paragraph text.
 */
export type Inline = { text: string; bold: boolean }[];
export type Block =
  | { type: "heading"; level: number; text: Inline }
  | { type: "paragraph"; text: Inline }
  | { type: "list"; ordered: boolean; items: Inline[] }
  | { type: "table"; head: Inline[]; rows: Inline[][] };

export function parseInline(s: string): Inline {
  const out: Inline = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

const cells = (line: string) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => parseInline(c.trim()));
const isSeparator = (line: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());
const LIST = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: parseInline(h[2].trim()) });
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      const body = rows.filter((r) => !isSeparator(r));
      const hasHead = rows.length > 1 && isSeparator(rows[1]);
      blocks.push({ type: "table", head: hasHead ? cells(body[0]) : [], rows: (hasHead ? body.slice(1) : body).map(cells) });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      const ordered = !li[1];
      const items: Inline[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || !m[1] === !ordered) break;
        items.push(parseInline(m[3].trim()));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !lines[i].trim().startsWith("|") && !LIST.test(lines[i])) {
      para.push(lines[i++].trim());
    }
    blocks.push({ type: "paragraph", text: parseInline(para.join(" ")) });
  }
  return blocks;
}
