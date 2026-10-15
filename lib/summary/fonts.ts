/**
 * Noto Sans for the six summary languages (Week 4 spec §2). Self-hosted by next/font at build.
 *
 * "Load only the one in use": every font is declared with preload: false, so nothing is fetched
 * up front. A browser downloads a web font only when text on the page is set in it, and each
 * Indic face also carries its script's unicode-range — so a page showing a Telugu summary
 * downloads Noto Sans Telugu (and Noto Sans for the Latin drug names), and nothing else.
 * Used only by the summary card and the print page.
 */
import { Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Sans_Malayalam, Noto_Sans_Tamil, Noto_Sans_Telugu } from "next/font/google";
import type { SummaryLanguage } from "./prompt";

// next/font needs literal options at each call (no spread).
const latin = Noto_Sans({ preload: false, display: "swap", subsets: ["latin"], variable: "--font-noto-en" });
const te = Noto_Sans_Telugu({ preload: false, display: "swap", subsets: ["telugu"], variable: "--font-noto-te" });
const hi = Noto_Sans_Devanagari({ preload: false, display: "swap", subsets: ["devanagari"], variable: "--font-noto-hi" });
const ta = Noto_Sans_Tamil({ preload: false, display: "swap", subsets: ["tamil"], variable: "--font-noto-ta" });
const kn = Noto_Sans_Kannada({ preload: false, display: "swap", subsets: ["kannada"], variable: "--font-noto-kn" });
const ml = Noto_Sans_Malayalam({ preload: false, display: "swap", subsets: ["malayalam"], variable: "--font-noto-ml" });

/** Defines the CSS variables. Declaring a face costs nothing until text uses it. */
export const SUMMARY_FONT_VARIABLES = [latin, te, hi, ta, kn, ml].map((f) => f.variable).join(" ");

/** The script's face first, Noto Sans for Latin drug names, doses and digits. */
export function summaryFontFamily(language: SummaryLanguage): string {
  return language === "en" ? "var(--font-noto-en), sans-serif" : `var(--font-noto-${language}), var(--font-noto-en), sans-serif`;
}
