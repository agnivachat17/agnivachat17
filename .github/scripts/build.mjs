/**
 * THE DISPLACEMENT MAP — asset generator
 *
 * Every visual object on the profile is emitted from here so that one palette,
 * one motion vocabulary and one data model govern the whole artifact.
 * Run weekly by .github/workflows/record.yml, and by hand with `node build.mjs`.
 *
 * No dependencies. Node 20+ (built-in fetch).
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets");
const USER = "agnivachat17";

/* ───────────────────────── palette ─────────────────────────
   colour is assigned by semantic role, never by taste.
   amber = built · sky = pushed · vermilion = the distance between them   */

const P = {
  dark: {
    g0: "#101728", g1: "#0B0F1A", g2: "#080B14",
    hi: "#EDEFF5", dim: "#7E8598", faint: "#4E586E", rule: "#1E2433", grid: "#1C2637",
    amb: "#F0A93B", ambDim: "#A87C36",
    sky: "#6CACD8", skyDim: "#3E6A8A",
    ver: "#FF3B21", verMid: "#FF4F26", verHot: "#FF8A3D", verDim: "#E4795C",
    spark: "#FFF3EA", ember: "#FFB07A", void: "#4E6E9E",
  },
  light: {
    g0: "#FFFFFF", g1: "#F7F5F0", g2: "#EFEBE2",
    hi: "#12151E", dim: "#6B7180", faint: "#8A8E98", rule: "#DDD9D0", grid: "#E4E0D7",
    amb: "#C77A14", ambDim: "#9A6B12",
    sky: "#2C7BA8", skyDim: "#7FA3BC",
    ver: "#D92B12", verMid: "#DC3A18", verHot: "#E8621F", verDim: "#B23A1E",
    spark: "#B02008", ember: "#E8621F", void: "#2C7BA8",
  },
};

const MONO = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`;
const SANS = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** text width is font-dependent; lock it so a missing font cannot break layout */
const lock = (len) => `textLength="${len}" lengthAdjust="spacingAndGlyphs"`;

const mono = (x, y, size, fill, ls, txt, extra = "") =>
  `<text x="${x}" y="${y}" font-family='${MONO}' font-size="${size}" fill="${fill}" letter-spacing="${ls}" ${extra}>${esc(txt)}</text>`;

const sans = (x, y, size, fill, txt, extra = "") =>
  `<text x="${x}" y="${y}" font-family='${SANS}' font-size="${size}" fill="${fill}" font-weight="300" ${extra}>${esc(txt)}</text>`;

/** mix two hex colours — used for the built→pushed ramp */
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** displacement drives temperature: 0 months reads neutral, 43 burns */
const heat = (c, months) => {
  const t = Math.min(months / 24, 1);
  return t < 0.08 ? c.sky : mix(c.amb, c.ver, t);
};


/**
 * Animate INTO a final state without ever depending on the animation.
 * The element's base attribute must already hold `to`, so any renderer that
 * ignores SMIL (link previews, social cards, reduced-motion paths) shows the
 * finished artwork instead of an empty one.
 */
function into(attr, from, to, delay, dur) {
  const total = delay + dur;
  const k = (delay / total).toFixed(4);
  return `<animate attributeName="${attr}" values="${from};${from};${to}" keyTimes="0;${k};1" dur="${total}s" begin="0s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.2 1"/>`;
}

const svg = (w, h, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">\n${body}\n</svg>\n`;

const ground = (c, w, h) =>
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.g0}"/><stop offset="0.5" stop-color="${c.g1}"/><stop offset="1" stop-color="${c.g2}"/>
  </linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/>`;

/* ───────────────────────── data ───────────────────────── */

const BUILT_OVERRIDE = { "IoT-Gesture-Voice-Car": "2022-10-01" };

/** private, so it never appears in the API — carried explicitly, with real numbers */
const PRIVATE = [{
  name: "lesson-tracker", private: true, role: "PROJECT LEAD",
  built: "2026-06-25", pushed: "2026-06-25", displaced: 0, commits: 17, added: 8970, removed: 3606,
  langs: [["JavaScript", 620000], ["SQL", 240000], ["CSS", 140000]],
  note: "internal tool · adamas university faculty",
  url: "https://github.com/agnivachat17",
}];

const months = (a, b) =>
  Math.max(0, Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 30.44)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Every call must either return real data or throw. A partial fetch that
 * quietly yields zero commits and no languages produces a chart that looks
 * plausible and is wrong, which is worse than no chart at all.
 */
async function api(path, attempt = 0) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json", "User-Agent": USER,
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (r.status === 403 || r.status === 429) {
    const reset = Number(r.headers.get("x-ratelimit-reset") || 0) * 1000;
    const wait = Math.min(Math.max(reset - Date.now(), 2000), 60000);
    if (attempt < 3) {
      console.warn(`rate limited on ${path} — waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      return api(path, attempt + 1);
    }
    throw new Error(`rate limited: ${path}. Set GITHUB_TOKEN and retry.`);
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
  return r.json();
}

async function collect() {
  const raw = await api(`/users/${USER}/repos?per_page=100&sort=created`);
  const repos = [];
  for (const r of raw) {
    if (r.fork || r.name === USER) continue;
    // real byte counts — a tiny repo that is 100% Java must not outweigh a large one
    const L = await api(`/repos/${USER}/${r.name}/languages`);
    const langs = Object.entries(L).sort((a, b) => b[1] - a[1]);
    const dates = [];
    for (let page = 1; page <= 5; page++) {
      const list = await api(`/repos/${USER}/${r.name}/commits?per_page=100&page=${page}`);
      dates.push(...list.map((c) => c.commit?.author?.date?.slice(0, 10)).filter(Boolean));
      if (list.length < 100) break;
    }
    const commits = dates.length;

    const pushed = r.created_at.slice(0, 10);
    const built = BUILT_OVERRIDE[r.name] ?? pushed;
    repos.push({
      name: r.name, url: r.html_url, desc: r.description || "",
      built, pushed, displaced: months(built, pushed),
      commits, dates, langs, stars: r.stargazers_count,
    });
  }
  return repos;
}

/* ───────────────────── 01 · plates (navigation) ─────────────────────
   each plate is its own file so it can be wrapped in its own link.     */

function plate(c, label, sub, accent) {
  const w = 264, h = 76;
  return svg(w, h, `${label} — ${sub}`,
    `${ground(c, w, h)}
     <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${c.rule}"/>
     <rect x="0" y="0" width="3" height="${h}" fill="${accent}"/>
     ${mono(22, 33, 14, c.hi, 3.2, label)}
     ${mono(22, 55, 10.5, c.faint, 2.2, sub)}
     <circle cx="${w - 22}" cy="38" r="3" fill="${accent}">
       <animate attributeName="opacity" values="1;0.25;1" dur="3s" repeatCount="indefinite"/>
     </circle>`);
}

/* ───────────────────── 02 · the gap ─────────────────────
   closed: cold, sealed, a scan that finds nothing.
   open:   the same span, warm, with the one thing that was in it.       */

function gapSealed(c, sm = false) {
  const w = sm ? 700 : 1200, h = sm ? 300 : 240;
  const x0 = sm ? 44 : 64, x1 = w - x0;
  const mid = h / 2 + (sm ? 10 : 6);
  return svg(w, h, "A sealed span. Thirty-nine months between January 2023 and May 2026 in which this account pushed nothing. A cold scan sweeps it and finds no record.",
    `${ground(c, w, h)}
     <defs>
       <linearGradient id="seal" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
         <stop offset="0" stop-color="${c.sky}" stop-opacity="0.55"/>
         <stop offset="0.5" stop-color="${c.sky}" stop-opacity="0.12"/>
         <stop offset="1" stop-color="${c.sky}" stop-opacity="0.55"/>
       </linearGradient>
       <linearGradient id="scan" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="90" y2="0">
         <stop offset="0" stop-color="${c.sky}" stop-opacity="0"/>
         <stop offset="0.5" stop-color="${c.sky}" stop-opacity="0.5"/>
         <stop offset="1" stop-color="${c.sky}" stop-opacity="0"/>
       </linearGradient>
     </defs>
     <line x1="${x0}" y1="${mid}" x2="${x1}" y2="${mid}" stroke="url(#seal)" stroke-width="2"/>
     <g stroke="${c.grid}">
       ${Array.from({ length: 13 }, (_, i) => {
         const x = x0 + ((x1 - x0) / 12) * i;
         return `<line x1="${x}" y1="${mid - 9}" x2="${x}" y2="${mid + 9}"/>`;
       }).join("")}
     </g>
     <rect x="${x0}" y="${mid - 26}" width="90" height="52" fill="url(#scan)">
       <animate attributeName="x" values="${x0};${x1 - 90};${x0}" dur="7s" repeatCount="indefinite"
                calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>
     </rect>
     ${mono(x0, sm ? 62 : 56, sm ? 15 : 13, c.sky, 3.4, "NO PUBLIC RECORD")}
     ${sans(x0, sm ? 130 : 116, sm ? 62 : 58, c.hi, "39 MONTHS")}
     ${mono(x0, mid + (sm ? 66 : 58), sm ? 13 : 11.5, c.faint, 2.4, "JAN 2023 — MAY 2026 · NOTHING PUSHED")}
     ${mono(x1, mid + (sm ? 66 : 58), sm ? 13 : 11.5, c.faint, 2.4, "SCANNING", `text-anchor="end"`)}`);
}

function gapOpen(c, sm = false) {
  const w = sm ? 700 : 1200, h = sm ? 420 : 340;
  const x0 = sm ? 44 : 64, x1 = w - x0;
  const rail = sm ? 250 : 210;
  return svg(w, h, "The same span, opened. It was not empty: the gesture-and-voice controlled car was built in October 2022 — accelerometer, Arduino, a working vehicle — and reached GitHub only in May 2026. Everything else from those months has no public record at all.",
    `${ground(c, w, h)}
     <defs>
       <linearGradient id="warm" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
         <stop offset="0" stop-color="${c.amb}" stop-opacity="0.9"/>
         <stop offset="0.55" stop-color="${c.amb}" stop-opacity="0.22"/>
         <stop offset="1" stop-color="${c.amb}" stop-opacity="0.06"/>
       </linearGradient>
       <radialGradient id="bloom" gradientUnits="userSpaceOnUse" cx="${x0 + 8}" cy="${rail}" r="${sm ? 200 : 260}">
         <stop offset="0" stop-color="${c.amb}" stop-opacity="0.20"/>
         <stop offset="1" stop-color="${c.amb}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="${w}" height="${h}" fill="url(#bloom)"/>
     ${mono(x0, sm ? 62 : 54, sm ? 15 : 13, c.amb, 3.4, "THE SPAN WAS NOT EMPTY")}
     ${sans(x0, sm ? 132 : 118, sm ? 52 : 54, c.hi, "ONE SURVIVES")}
     <line x1="${x0}" y1="${rail}" x2="${x1}" y2="${rail}" stroke="url(#warm)" stroke-width="2"/>
     <circle cx="${x0 + 8}" cy="${rail}" r="7" fill="${c.amb}"/>
     <circle cx="${x0 + 8}" cy="${rail}" r="14" fill="none" stroke="${c.amb}" stroke-width="1.2">
       <animate attributeName="r" values="14;26;14" dur="3.4s" repeatCount="indefinite"/>
       <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="3.4s" repeatCount="indefinite"/>
     </circle>
     ${mono(x0 + 30, rail - 12, sm ? 15 : 13.5, c.amb, 2.4, "OCT 2022 · GESTURE CAR")}
     ${mono(x0 + 30, rail + 14, sm ? 13 : 11.5, c.ambDim, 1.8, "ARDUINO · ACCELEROMETER · VOICE INPUT")}
     ${mono(x0 + 30, rail + 34, sm ? 13 : 11.5, c.verDim, 1.8, "UPLOADED JAN 2023 · DOCUMENTED MAY 2026")}
     <g stroke="${c.grid}" stroke-dasharray="2 7">
       ${Array.from({ length: 5 }, (_, i) => {
         const x = x0 + 300 + i * ((x1 - x0 - 320) / 5);
         return `<line x1="${x}" y1="${rail - 26}" x2="${x}" y2="${rail + 26}"/>`;
       }).join("")}
     </g>
     ${mono(x1, rail + (sm ? 92 : 84), sm ? 12 : 11, c.faint, 2.2, "EVERYTHING ELSE · NO RECORD", `text-anchor="end"`)}
     ${mono(x0, h - (sm ? 40 : 34), sm ? 12.5 : 11.5, c.dim, 2.2, "GIT KNOWS WHEN YOU PUSHED. IT DOES NOT KNOW WHEN YOU BUILT.")}`);
}

/* ───────────────────── 03 · object tiles ─────────────────────
   one per repo, each its own file so the tile itself is a link.  */

function tile(c, o) {
  const w = 568, h = 226;
  const hot = heat(c, o.displaced);
  const railY1 = 128, railY2 = 178;
  const x0 = 26, x1 = w - 26;
  const span = x1 - x0;
  const dotN = Math.max(1, Math.min(28, o.commits));
  const dots = Array.from({ length: dotN }, (_, i) =>
    `<circle cx="${x0 + i * 9}" cy="${railY1}" r="2.6" fill="${c.amb}"/>`).join("");
  // language signature: a band ramped from built-amber to pushed-sky
  const langs = (o.langs || []).slice(0, 4);
  const total = langs.reduce((a, b) => a + b[1], 0) || 1;
  let cx = x0;
  const band = langs.map(([, pct], i) => {
    const bw = (pct / total) * span;
    const seg = `<rect x="${cx}" y="${h - 40}" width="${Math.max(bw - 2, 2)}" height="6" fill="${mix(c.amb, c.sky, langs.length === 1 ? 0.35 : i / (langs.length - 1 || 1))}" rx="1">
        ${into("width", 0, Math.max(bw - 2, 2), 0.2 + i * 0.12, 0.9)}
      </rect>`;
    cx += bw;
    return seg;
  }).join("");

  const displacedLabel = o.private ? o.role
    : o.displaced > 1 ? `${o.displaced} MONTHS DISPLACED` : "RECORD ACCURATE";

  return svg(w, h, `${o.name} — ${o.desc || o.note || ""} ${displacedLabel}`,
    `${ground(c, w, h)}
     <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${c.rule}"/>
     <rect x="0" y="0" width="3" height="${h}" fill="${hot}"/>
     ${mono(x0, 44, 17, c.hi, 1.6, o.name)}
     ${mono(x0, 68, 11, c.dim, 1.6, (o.desc || o.note || "").slice(0, 58).toUpperCase())}
     ${mono(x1, 44, 11.5, hot, 2.2, displacedLabel, `text-anchor="end"`)}

     <g opacity="0.9">${dots}</g>
     <line x1="${x0}" y1="${railY2}" x2="${x1}" y2="${railY2}" stroke="${c.sky}" stroke-opacity="0.35" stroke-width="1.4"/>
     <line x1="${x0}" y1="${railY1}" x2="${x0 + Math.min(dotN, 28) * 9 - 9}" y2="${railY1}" stroke="${c.amb}" stroke-opacity="0.3" stroke-width="1.4"/>

     ${o.displaced > 1
       ? `<line x1="${x0}" y1="${railY1}" x2="${x1 - 8}" y2="${railY2}" stroke="${hot}" stroke-width="2.2"
             stroke-dasharray="560" stroke-dashoffset="0">
            ${into("stroke-dashoffset", 560, 0, 0.4, 2.4)}
          </line>
          <circle r="3.4" fill="${c.ember}">
            <animateMotion dur="6s" repeatCount="indefinite" path="M ${x0} ${railY1} L ${x1 - 8} ${railY2}"/>
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.9;1" dur="6s" repeatCount="indefinite"/>
          </circle>`
       : `<g stroke="${c.skyDim}" stroke-width="1.2" stroke-opacity="0.55">
            ${Array.from({ length: 7 }, (_, i) => {
              const x = x0 + i * ((span - 10) / 6);
              return `<line x1="${x}" y1="${railY1}" x2="${x}" y2="${railY2}"/>`;
            }).join("")}
          </g>`}

     ${band}
     ${mono(x0, h - 16, 10.5, c.faint, 2, `${o.commits} COMMITS · ${(o.langs?.[0]?.[0] || "—").toUpperCase()}`)}
     ${mono(x1, h - 16, 10.5, c.faint, 2, o.private ? "PRIVATE REPOSITORY" : `PUSHED ${o.pushed.slice(0, 7)}`, `text-anchor="end"`)}`);
}

/* ───────────────────── 04 · composition ─────────────────────
   the tech stack, drawn on the built→pushed axis instead of listed. */

function composition(c, langs, sm = false) {
  const w = sm ? 700 : 1200, h = sm ? 460 : 320;
  const x0 = sm ? 44 : 64, x1 = w - x0, span = x1 - x0;
  const total = langs.reduce((a, b) => a + b.bytes, 0) || 1;
  const top = sm ? 190 : 150;

  let cx = x0;
  const bars = langs.map((l, i) => {
    const bw = (l.bytes / total) * span;
    const col = mix(c.amb, c.sky, Math.min(1, (cx + bw / 2 - x0) / span));
    const seg = `<g>
        <rect x="${cx}" y="${top}" width="${Math.max(bw - 3, 2)}" height="${sm ? 46 : 40}" fill="${col}" rx="1.5">
          ${into("width", 0, Math.max(bw - 3, 2), 0.15 + i * 0.14, 1.1)}
        </rect>
        ${bw > (sm ? 74 : 62) ? mono(cx + 2, top + (sm ? 76 : 66), sm ? 12 : 11, c.dim, 1.6, l.name.toUpperCase()) : ""}
        ${bw > (sm ? 74 : 62) ? mono(cx + 2, top + (sm ? 96 : 84), sm ? 12.5 : 11.5, col, 1.4, `${((l.bytes / total) * 100).toFixed(1)}%`) : ""}
      </g>`;
    cx += bw;
    return seg;
  }).join("");

  return svg(w, h, `Composition: the real language distribution across every public repository, drawn as one band ramping from built-amber to pushed-sky. ${langs.map((l) => `${l.name} ${((l.bytes / total) * 100).toFixed(1)} percent`).join(", ")}.`,
    `${ground(c, w, h)}
     ${mono(x0, sm ? 62 : 54, sm ? 15 : 13, c.amb, 3.4, "COMPOSITION")}
     ${sans(x0, sm ? 128 : 114, sm ? 46 : 50, c.hi, "WHAT IT IS MADE OF")}
     ${mono(x0, sm ? 158 : 138, sm ? 12.5 : 11.5, c.faint, 2.2, "MEASURED IN BYTES, NOT CLAIMED IN BADGES")}
     ${bars}
     <line x1="${x0}" y1="${top + (sm ? 130 : 116)}" x2="${x1}" y2="${top + (sm ? 130 : 116)}" stroke="${c.rule}"/>
     ${mono(x0, top + (sm ? 158 : 140), sm ? 12 : 11, c.faint, 2.2, "BUILT")}
     ${mono(x1, top + (sm ? 158 : 140), sm ? 12 : 11, c.faint, 2.2, "PUSHED", `text-anchor="end"`)}`);
}

/* ───────────────────── 05 · traces header ───────────────────── */

function traces(c, marks, sm = false) {
  const w = sm ? 700 : 1200, h = sm ? 220 : 180;
  const x0 = sm ? 44 : 64, x1 = w - x0, span = x1 - x0;
  const base = sm ? 158 : 128;
  const bars = marks.map((m, i) => {
    const x = x0 + (i / (marks.length - 1 || 1)) * span;
    const barH = 8 + m * 34;
    const d = 0.1 + i * 0.02;
    return `<rect x="${x}" y="${base - barH}" width="2.5" height="${barH}" fill="${mix(c.amb, c.sky, i / (marks.length - 1 || 1))}" opacity="0.85">
      ${into("height", 0, barH, d, 0.7)}
      ${into("y", base, base - barH, d, 0.7)}
    </rect>`;
  }).join("");

  return svg(w, h, "Traces: every commit this account has ever pushed, one bar each, in order.",
    `${ground(c, w, h)}
     ${mono(x0, sm ? 56 : 48, sm ? 15 : 13, c.amb, 3.4, "TRACES")}
     ${mono(x1, sm ? 56 : 48, sm ? 12 : 11, c.faint, 2.2, `${marks.length} COMMITS, IN ORDER`, `text-anchor="end"`)}
     ${bars}
     <line x1="${x0}" y1="${base}" x2="${x1}" y2="${base}" stroke="${c.rule}"/>
     <rect x="${x0}" y="${base - 44}" width="2" height="44" fill="${c.ver}" opacity="0.9">
       <animate attributeName="x" values="${x0};${x1};${x0}" dur="11s" repeatCount="indefinite"
                calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>
     </rect>
     ${mono(x0, h - (sm ? 26 : 22), sm ? 12 : 11, c.faint, 2.2, "THE RECORD, READ END TO END")}`);
}

/* ───────────────────── 06 · signal ───────────────────── */

function signal(c, pts, updated, sm = false) {
  const w = sm ? 700 : 1200, h = sm ? 230 : 190;
  const x0 = sm ? 44 : 64, x1 = w - x0, span = x1 - x0;
  const base = sm ? 165 : 138, amp = sm ? 54 : 46;
  const max = Math.max(...pts, 1);
  const d = pts.map((p, i) => {
    const x = x0 + (i / (pts.length - 1 || 1)) * span;
    const y = base - (p / max) * amp;
    return `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  return svg(w, h, `Signal: recent public activity, regenerated automatically. Last recount ${updated}.`,
    `${ground(c, w, h)}
     <defs>
       <linearGradient id="sig" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
         <stop offset="0" stop-color="${c.sky}" stop-opacity="0.25"/>
         <stop offset="0.7" stop-color="${c.amb}" stop-opacity="0.9"/>
         <stop offset="1" stop-color="${c.ver}"/>
       </linearGradient>
     </defs>
     ${mono(x0, sm ? 56 : 48, sm ? 15 : 13, c.amb, 3.4, "SIGNAL")}
     ${mono(x1, sm ? 56 : 48, sm ? 12 : 11, c.faint, 2.2, `RECOUNTED ${updated}`, `text-anchor="end"`)}
     <path d="${d}" fill="none" stroke="url(#sig)" stroke-width="2.2" stroke-linejoin="round"
           stroke-dasharray="2000" stroke-dashoffset="0">
       ${into("stroke-dashoffset", 2000, 0, 0.2, 2.2)}
     </path>
     <circle r="4" fill="${c.ver}" cx="${x1}" cy="${base - (pts[pts.length - 1] / max) * amp}">
       <animate attributeName="r" values="4;7;4" dur="2.4s" repeatCount="indefinite"/>
     </circle>
     <circle r="10" fill="none" stroke="${c.ver}" stroke-width="1" cx="${x1}" cy="${base - (pts[pts.length - 1] / max) * amp}">
       <animate attributeName="r" values="8;20;8" dur="2.4s" repeatCount="indefinite"/>
       <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite"/>
     </circle>
     <line x1="${x0}" y1="${base + 24}" x2="${x1}" y2="${base + 24}" stroke="${c.rule}"/>
     ${mono(x0, base + (sm ? 52 : 46), sm ? 12 : 11, c.faint, 2.2, "THE RECORD IS CURRENT")}`);
}

/* ───────────────────── emit ───────────────────── */

const write = async (name, body) => {
  await writeFile(resolve(OUT, name), body);
  return name;
};

const CACHE = resolve(OUT, "record.json");

async function main() {
  await mkdir(OUT, { recursive: true });

  let repos;
  try {
    repos = await collect();
    await writeFile(CACHE, JSON.stringify(repos, null, 2));
  } catch (err) {
    // fall back to the last good fetch rather than emitting a confident lie
    const { readFile } = await import("node:fs/promises");
    try {
      repos = JSON.parse(await readFile(CACHE, "utf8"));
      console.warn(`live fetch failed (${err.message}) — redrawing from cached record`);
    } catch {
      throw new Error(`live fetch failed and no cache exists: ${err.message}`);
    }
  }
  const objects = [...PRIVATE, ...repos].sort((a, b) => b.displaced - a.displaced || b.commits - a.commits);

  // aggregate language bytes across every public repo
  const totals = new Map();
  for (const r of repos) for (const [k, bytes] of r.langs) totals.set(k, (totals.get(k) || 0) + bytes);
  const langs = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, bytes]) => ({ name, bytes }));

  // every commit this account has pushed, in real chronological order
  const allDates = repos.flatMap((r) => r.dates).sort();
  const perDay = new Map();
  for (const d of allDates) perDay.set(d, (perDay.get(d) || 0) + 1);
  // bar height = how much happened that day, so a one-day burst reads as a burst
  const busiest = Math.max(...perDay.values(), 1);
  const marks = allDates.map((d) => perDay.get(d) / busiest);

  // monthly counts across the whole span — the silence is real empty months
  const first = allDates[0]?.slice(0, 7) ?? "2022-10";
  const cursor = new Date(`${first}-01T00:00:00Z`);
  const now = new Date();
  const perMonth = new Map();
  for (const d of allDates) perMonth.set(d.slice(0, 7), (perMonth.get(d.slice(0, 7)) || 0) + 1);
  const pts = [];
  while (cursor <= now) {
    pts.push(perMonth.get(cursor.toISOString().slice(0, 7)) || 0);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const updated = new Date().toISOString().slice(0, 10);

  const files = [];
  for (const [theme, c] of Object.entries(P)) {
    const t = theme === "dark" ? "dark" : "light";

    files.push(await write(`nav-record-${t}.svg`, plate(c, "THE GAP", "39 MONTHS, SEALED", c.sky)));
    files.push(await write(`nav-objects-${t}.svg`, plate(c, "OBJECTS", "9 · PLOTTED BY DISPLACEMENT", c.amb)));
    files.push(await write(`nav-composition-${t}.svg`, plate(c, "COMPOSITION", "MEASURED IN BYTES", c.amb)));
    files.push(await write(`nav-signal-${t}.svg`, plate(c, "SIGNAL", "LIVE · RECOUNTED WEEKLY", c.ver)));

    files.push(await write(`gap-sealed-${t}.svg`, gapSealed(c)));
    files.push(await write(`gap-sealed-${t}-sm.svg`, gapSealed(c, true)));
    files.push(await write(`gap-open-${t}.svg`, gapOpen(c)));
    files.push(await write(`gap-open-${t}-sm.svg`, gapOpen(c, true)));

    for (const o of objects) files.push(await write(`obj-${o.name}-${t}.svg`, tile(c, o)));

    files.push(await write(`composition-${t}.svg`, composition(c, langs)));
    files.push(await write(`composition-${t}-sm.svg`, composition(c, langs, true)));
    files.push(await write(`traces-${t}.svg`, traces(c, marks)));
    files.push(await write(`traces-${t}-sm.svg`, traces(c, marks, true)));
    files.push(await write(`signal-${t}.svg`, signal(c, pts, updated)));
    files.push(await write(`signal-${t}-sm.svg`, signal(c, pts, updated, true)));
  }

  console.log(`objects: ${objects.map((o) => `${o.name}(${o.displaced}mo)`).join(", ")}`);
  console.log(`languages: ${langs.map((l) => l.name).join(", ")}`);
  console.log(`wrote ${files.length} assets`);
}

main().catch((e) => { console.error(e); process.exit(1); });
