import { parseMarkdown, type Inline } from "@/lib/summary/markdown";
import { summaryFontFamily } from "@/lib/summary/fonts";
import type { SummaryLanguage } from "@/lib/summary/prompt";

function Text({ parts }: { parts: Inline }) {
  return (
    <>
      {parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/**
 * A summary rendered as elements, never as HTML. `lang` lets screen readers and the browser's
 * line breaking treat the script correctly; break-words keeps long words inside a phone screen.
 * The medicines table is a stacked list below `sm` so four columns never overflow at 390 px.
 */
export function SummaryMarkdown({ text, language }: { text: string; language: SummaryLanguage }) {
  return (
    <div lang={language} style={{ fontFamily: summaryFontFamily(language) }} className="summary-text space-y-3 break-words leading-relaxed text-slate-900">
      {parseMarkdown(text).map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <h3 key={i} className="pt-2 text-base font-bold">
                <Text parts={b.text} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={i}>
                <Text parts={b.text} />
              </p>
            );
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return (
              <L key={i} className={`space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Text parts={it} />
                  </li>
                ))}
              </L>
            );
          }
          case "table":
            return (
              <table key={i} className="summary-table w-full text-left text-sm">
                {b.head.length > 0 && (
                  <thead className="text-slate-700">
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} scope="col" className="border-b border-slate-300 py-1.5 pr-2 font-semibold">
                          <Text parts={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} className="border-b border-slate-100 align-top">
                      {r.map((c, k) => (
                        <td key={k} data-label={b.head[k]?.map((p) => p.text).join("") ?? ""} className="py-1.5 pr-2">
                          <Text parts={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
        }
      })}
    </div>
  );
}
