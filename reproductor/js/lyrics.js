

import { bridge } from "./bridge.js";

export const line = (timeMs, text, extra = {}) => ({ timeMs, text, words: [], sungUntilMs: null, background: null, alignment: "start", ...extra });
export const isGap = l => l.text.length === 0;
const hasKnownEnd = l => l.words.length > 0 || l.sungUntilMs !== null;
export function endMs(l) {
  const lead = l.words.at(-1)?.endMs ?? l.sungUntilMs ?? l.timeMs;
  return Math.max(lead, l.background ? endMs(l.background) : lead);
}
function normalizedSyllables(parts, length) {
  const usable = parts.filter(p => p.endChar > p.startChar && p.startChar < length).sort((a, b) => a.startChar - b.startChar);
  if (usable.length < 2) return [];
  return usable.map((p, i) => ({ startMs: p.startMs, endMs: Math.max(p.startMs, p.endMs), startChar: i === 0 ? 0 : p.startChar, endChar: usable[i + 1]?.startChar ?? length }));
}
const UNSPACED = /[㐀-鿿぀-ヿ　-〿＀-￯฀-๿]/;
const isWs = c => c !== undefined && /\s/.test(c);

function wordsFromRuns(runs, spacingIsExplicit = false) {
  const glue = spacingIsExplicit || runs.some(r => /\s/.test(r.raw));
  const words = []; let cur = "", parts = [], start = 0, end = 0;
  const flush = () => { if (cur) words.push({ startMs: start, endMs: Math.max(start, end), text: cur, syllables: normalizedSyllables(parts, cur.length) }); cur = ""; parts = []; };
  for (const run of runs) {
    const content = run.raw.trim();
    if (!content) { flush(); continue; }
    const joins = glue && cur.length > 0 && !isWs(run.raw[0]) && !UNSPACED.test(cur.at(-1)) && !UNSPACED.test(content[0]);
    if (!joins) flush();
    if (!cur) { start = run.startMs; end = run.startMs; }
    const from = cur.length; cur += content;
    const runEnd = Math.max(run.startMs, run.endMs);
    parts.push({ startMs: run.startMs, endMs: runEnd, startChar: from, endChar: cur.length });
    end = Math.max(end, runEnd);
    if (!glue || isWs(run.raw.at(-1))) flush();
  }
  flush();
  return words;
}
const MIN_GAP_MS = 4000;
function withInstrumentalGaps(lines) {
  if (!lines.length) return lines;
  const out = [];
  if (lines[0].timeMs >= MIN_GAP_MS) out.push(line(0, ""));
  lines.forEach((l, i) => {
    out.push(l);
    const next = lines[i + 1];
    if (!next || !hasKnownEnd(l)) return;
    const end = endMs(l);
    if (next.timeMs - end >= MIN_GAP_MS && end > l.timeMs) out.push(line(end, ""));
  });
  return out;
}

function bracketStart(text) {
  if (!text.endsWith(")")) return null;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    else if (text[i] === "(" && --depth === 0) return i > 0 ? i : null;
  }
  return null;
}
function wordStartingAt(words, offset) {
  let at = 0;
  for (let i = 0; i < words.length; i++) { if (at === offset) return i; if (at > offset) return null; at += words[i].text.length + 1; }
  return null;
}
function withBackgroundVocals(lines) {
  return lines.map(l => {
    if (l.background || isGap(l)) return l;
    const open = bracketStart(l.text); if (open === null) return l;
    const lead = l.text.slice(0, open).trimEnd(), backing = l.text.slice(open).trim();
    if (!lead || !/[\p{L}\p{N}]/u.test(backing)) return l;
    if (!l.words.length) return { ...l, text: lead, background: line(l.timeMs, backing, { sungUntilMs: l.sungUntilMs }) };
    const split = wordStartingAt(l.words, open); if (!split || split <= 0) return l;
    const bw = l.words.slice(split);
    return { ...l, text: lead, words: l.words.slice(0, split), background: line(bw[0].startMs, backing, { words: bw }) };
  });
}

function lineAlignments(singers, types) {
  let left = true, last = null, right = 0, placed = 0;
  const sides = singers.map(s => {
    if (!s) return "start";
    const type = types[s] ?? (s === "v1000" ? "group" : s === "v2000" ? "other" : "person");
    placed++;
    if (type === "group") return "start";
    if (last === null) left = type !== "other"; else if (s !== last) left = !left;
    last = s; if (!left) right++;
    return left ? "start" : "end";
  });
  if (!placed || right / placed < .85) return sides;
  return sides.map(s => s === "start" ? "end" : "start");
}

const cp = (e, v) => v <= 0x10ffff ? String.fromCodePoint(v) : e;
const decodeEntities = t => !t.includes("&") ? t : t.replace(/&#x([0-9a-fA-F]+);/g, (e, h) => cp(e, parseInt(h, 16))).replace(/&#(\d+);/g, (e, d) => cp(e, +d))
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function ttmlTime(v) {
  const raw = v?.trim(); if (!raw) return null;
  if (raw.endsWith("ms")) { const ms = Number(raw.slice(0, -2)); return Number.isFinite(ms) ? Math.trunc(ms) : null; }
  const p = raw.replace(/s$/, "").split(":").map(Number);
  if (p.some(n => !Number.isFinite(n)) || p.length > 3) return null;
  return Math.trunc(p.reduce((t, n) => t * 60 + n, 0) * 1000);
}
const qualified = (el, name) => {
  const d = el.getAttribute(name); if (d) return d;
  const local = name.split(":")[1] ?? name;
  for (const a of Array.from(el.attributes)) if (a.name === name || a.name === local || a.localName === local) return a.value;
  return "";
};
const hasTimedChild = el => Array.from(el.children).some(c => c.getAttribute("begin") || hasTimedChild(c));
function collect(node, out, backing) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      const role = qualified(child, "ttm:role");
      if (role === "x-translation" || role === "x-roman") continue;
      const sink = role === "x-bg" ? backing : out;
      const b = ttmlTime(child.getAttribute("begin")), e = ttmlTime(child.getAttribute("end"));
      if (b !== null && e !== null && !hasTimedChild(child)) sink.push({ kind: "timed", text: child.textContent ?? "", start: b, end: e });
      else collect(child, sink, backing);
    } else if (child.nodeType === 3 && child.textContent) out.push({ kind: "text", text: child.textContent });
  }
}
function mergeIntoWords(pieces) {
  const words = []; let cur = "", syl = [], start = 0, end = 0, timed = false;
  const flush = () => { const t = cur.trim(); cur = ""; if (t && timed) words.push({ startMs: start, endMs: end, text: t, syllables: normalizedSyllables(syl, t.length) }); syl = []; timed = false; };
  for (const p of pieces) {
    if (p.kind === "text") { if (!p.text.trim()) flush(); else if (timed) cur += p.text; continue; }
    if (!p.text.trim()) continue;
    if (/^\s/.test(p.text)) flush();
    if (!cur) start = p.start;
    const from = cur.length; cur += p.text.trim();
    syl.push({ startMs: p.start, endMs: p.end, startChar: from, endChar: cur.length });
    end = p.end; timed = true;
    if (/\s$/.test(p.text)) flush();
  }
  flush();
  return words;
}
function lineFrom(p) {
  const pieces = [], back = [];
  collect(p, pieces, back);
  const words = mergeIntoWords(pieces), bw = mergeIntoWords(back);
  const backing = bw.length ? line(bw[0].startMs, bw.map(w => w.text).join(" "), { words: bw }) : null;
  if (!words.length) {
    const text = p.textContent?.trim() ?? "", begin = ttmlTime(p.getAttribute("begin"));
    if (begin === null || !text) return null;
    const end = ttmlTime(p.getAttribute("end"));
    return line(begin, text, { sungUntilMs: end !== null && end > begin ? end : null });
  }
  const begin = ttmlTime(p.getAttribute("begin")) ?? words[0].startMs;
  return line(Math.min(begin, words[0].startMs), words.map(w => w.text).join(" "), { words, background: backing });
}
function parseTtml(ttml) {
  try {
    const doc = new DOMParser().parseFromString(ttml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) return [];
    const types = {};
    const agents = doc.getElementsByTagName("ttm:agent").length ? doc.getElementsByTagName("ttm:agent") : doc.getElementsByTagName("agent");
    for (const a of Array.from(agents)) { const id = qualified(a, "xml:id"), t = a.getAttribute("type"); if (id && t) types[id] = t; }
    const sung = [];
    for (const p of Array.from(doc.getElementsByTagName("p"))) { const l = lineFrom(p); if (l) sung.push({ line: l, agent: qualified(p, "ttm:agent") || null }); }
    sung.sort((a, b) => a.line.timeMs - b.line.timeMs);
    const sides = lineAlignments(sung.map(s => s.agent), types);
    return withInstrumentalGaps(sung.map((s, i) => ({ ...s.line, alignment: sides[i] })));
  } catch { return []; }
}
const A2_LINE = /^\[(\d{1,3}):(\d{2})[.:](\d{2,3})\](.*)$/, A2_WORD = /<(\d{1,3}):(\d{2})[.:](\d{2,3})>([^<]*)/g;
const stamp = (m, s, f) => Number(m) * 60000 + Number(s) * 1000 + (f.length === 3 ? Number(f) : Number(f) * 10);
function parseEnhancedLrc(lrc) {
  const rows = lrc.split(/\r?\n/).map(l => A2_LINE.exec(l.trim())).filter(Boolean)
    .map(m => ({ timeMs: stamp(m[1], m[2], m[3]), words: [...m[4].matchAll(A2_WORD)], plain: m[4].trim() })).sort((a, b) => a.timeMs - b.timeMs);
  if (!rows.some(r => r.words.length)) return [];
  const lines = [];
  rows.forEach((row, i) => {
    if (!row.words.length) { const t = decodeEntities(row.plain); if (t) lines.push(line(row.timeMs, t)); return; }
    const last = row.words.at(-1), lineEnd = rows[i + 1]?.timeMs ?? stamp(last[1], last[2], last[3]) + 800;
    const runs = row.words.map((m, k) => { const n = row.words[k + 1]; return { startMs: stamp(m[1], m[2], m[3]), endMs: n ? stamp(n[1], n[2], n[3]) : lineEnd, raw: decodeEntities(m[4]) }; });
    const words = wordsFromRuns(runs); if (!words.length) return;
    lines.push(line(Math.min(row.timeMs, words[0].startMs), words.map(w => w.text).join(" "), { words }));
  });
  return withInstrumentalGaps(lines);
}
const LRC_STAMP = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/, WORD_STAMP = /<(\d{1,3}):(\d{2})[.:](\d{2,3})>/g;
function parseLrc(lrc) {
  const all = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = LRC_STAMP.exec(raw); if (!m) continue;
    const stamps = [m]; let end = m.index + m[0].length;
    for (let n = LRC_STAMP.exec(raw.slice(end)); n?.index === 0; n = LRC_STAMP.exec(raw.slice(end))) { stamps.push(n); end += n[0].length; }
    let body = raw.slice(end), alignment = "start";
    if (body.startsWith("<R>")) { body = body.slice(3); alignment = "end"; }
    const marks = [...body.matchAll(WORD_STAMP)];
    const runs = marks.map((k, i) => { const n = marks[i + 1], s = stamp(k[1], k[2], k[3]); return { startMs: s, endMs: n ? stamp(n[1], n[2], n[3]) : s, raw: body.slice(k.index + k[0].length, n?.index ?? body.length) }; });
    for (const at of stamps) all.push(line(stamp(at[1], at[2], at[3]), body.replace(WORD_STAMP, "").trim(), { words: marks.length ? wordsFromRuns(runs) : [], alignment }));
  }
  all.sort((a, b) => a.timeMs - b.timeMs);
  const kept = all.filter((l, i) => l.text || !all[i + 1] || all[i + 1].timeMs - l.timeMs >= MIN_GAP_MS);
  return kept[0]?.text && kept[0].timeMs >= MIN_GAP_MS ? [line(0, ""), ...kept] : kept;
}
const plainLines = c => /\b(?:lyrics? (?:not found|unavailable)|error)\b/i.test(c) ? [] : c.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^\[[A-Za-z]+:.*\]$/.test(l)).map(l => line(0, l));
const KEYS = ["ttml", "ttmlContent", "lyrics", "lrc", "content", "text", "plainLyrics", "syncedLyrics", "line", "lines", "lyric", "data", "result", "response"];
function extract(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") { const t = v.trim(); try { const n = JSON.parse(t); if (n && typeof n === "object") return extract(n); } catch {} return t; }
  if (Array.isArray(v)) return v.map(extract).filter(Boolean).join("\n") || null;
  if (typeof v === "object") {
    if (v.isError === true || v.ok === false || (v.error && v.error !== false && v.error !== "")) return null;
    for (const k of KEYS) { const f = k in v ? extract(v[k]) : null; if (f) return f; }
    return extract(v.metadata) ?? extract(v.words);
  }
  return null;
}
function unwrap(raw) {
  let v = raw.replace(/﻿/g, "").trim();
  if (v.startsWith("```")) { const ls = v.split("\n").slice(1); if (ls.at(-1)?.trim() === "```") ls.pop(); v = ls.join("\n").trim(); }
  if (!v) return null;
  try { return extract(JSON.parse(v))?.trim() || null; } catch { return v; }
}
function parseProvider(raw) {
  const u = unwrap(raw); if (!u) return null;
  const content = /&lt;tt/i.test(u) ? u.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&") : u;
  let lines;
  if (/<tt(?:\s|>)/i.test(content) || /http:\/\/www\.w3\.org\/ns\/ttml/i.test(content)) lines = parseTtml(content);
  else if (content.trimStart().startsWith("<")) lines = [];
  else { lines = parseEnhancedLrc(content); if (!lines.length) lines = parseLrc(content); if (!lines.length) lines = plainLines(content); }
  return lines.some(l => l.text.trim()) ? { lines } : null;
}

export const trace = [];
const note = (url, what) => { try { const u = new URL(url); trace.push(`${u.hostname}${u.pathname.length > 1 ? u.pathname : ""}${u.search ? decodeURIComponent(u.search).slice(0, 150) : ""}\n    -> ${what}`); } catch {} };
async function viaExtension(url) {
  try { const t = await bridge("lyrics", { url }); note(url, t === null ? "extensión: el host no devolvió letras" : "extensión: ok"); return t ?? null; }
  catch (e) { note(url, "extensión: " + e.message); return null; }
}
async function get(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json, text/plain, */*" }, signal: AbortSignal.timeout(6000), referrerPolicy: "no-referrer" });
    note(url, "directo " + r.status);
    if (r.status === 401 || r.status === 403) return viaExtension(url);
    return r.ok ? await r.text() : null;
  } catch (e) {

    if (e instanceof TypeError) { note(url, "directo bloqueado (CORS/red), probando por la extensión"); return viaExtension(url); }
    note(url, "tiempo agotado"); return null;
  }
}
const urlWith = (base, params) => { const u = new URL(base); for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.searchParams.set(k, String(v)); return u.toString(); };
const json = b => { if (!b) return null; try { return JSON.parse(b); } catch { return null; } };
const secs = ms => ms > 0 ? Math.floor(ms / 1000) : null;
const fromTtml = t => { if (!t) return null; const lines = parseTtml(t); return lines.length ? { lines } : null; };
const fromLines = l => l?.some(x => x.text.trim()) ? { lines: l } : null;

const LRC_RED = "https://lrc.red/", ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const lrcRedDoc = isrc => { const c = isrc?.trim().toUpperCase(); return c && ISRC.test(c) ? `${LRC_RED}s/${c}.ttml` : null; };
const VERSION_WORDS = new Set(["live", "remix", "remixed", "mix", "acoustic", "unplugged", "instrumental", "karaoke", "cappella", "acapella", "demo", "edit", "version", "cover", "sped", "slowed", "reverb", "nightcore", "lofi", "orchestral", "extended"]);
const BRACKETED = /[([][^)\]]*[)\]]/g, ARTIST_SEP = /\s*(?:,|&|;|\/|\s+and\s+|\s+x\s+|\s+with\s+|\s+feat\.?\s+|\s+ft\.?\s+)\s*/i;
const norm = v => v.normalize("NFD").replace(/\p{Mn}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, " ").replace(/\s+/g, " ").trim();
const coreOf = t => norm(t.replace(BRACKETED, " ").split(" - ")[0]) || norm(t);
const versionOf = t => new Set(norm(`${(t.match(BRACKETED) ?? []).join(" ")} ${t.includes(" - ") ? t.slice(t.indexOf(" - ") + 3) : ""}`).split(" ").filter(w => VERSION_WORDS.has(w)));
const artistsOf = a => new Set(a.split(ARTIST_SEP).map(norm).filter(Boolean));
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
function bestLrcRedHit(hits, title, artist, durationMs) {
  const wt = coreOf(title), wv = versionOf(title), wa = artistsOf(artist), s = durationMs / 1000;
  const dist = h => durationMs > 0 && h.duration != null ? Math.abs(h.duration - s) : 0;
  return hits.filter(h => h.title && lrcRedDoc(h.isrc) && coreOf(h.title) === wt && sameSet(versionOf(h.title), wv)
    && (!wa.size || [...artistsOf(h.artist ?? "")].some(a => wa.has(a))) && dist(h) <= 3).sort((a, b) => dist(a) - dist(b))[0] ?? null;
}
async function lrcRed(q, doc) {
  const known = lrcRedDoc(q.isrc);
  if (known) { const f = fromTtml(await doc(known)); if (f) return f; }
  const body = json(await get(urlWith(`${LRC_RED}search.json`, { q: `${q.title} ${q.artist}`.trim() })));
  const url = lrcRedDoc(bestLrcRedHit(body?.hits ?? [], q.title, q.artist, q.durationMs)?.isrc);
  return url && url !== known ? fromTtml(await doc(url)) : null;
}

function nameVariants(q) {
  const v = [{ title: q.title, artist: q.artist }];
  if (q.feat) {
    v.push({ title: q.title, artist: `${q.artist}, ${q.feat}` }, { title: q.title, artist: `${q.artist} & ${q.feat}` });
    const jp = JP[q.feat.toLowerCase()]; if (jp) v.push({ title: q.title, artist: `${q.artist}, ${jp}` });
  }
  if (q.rawTitle && q.rawTitle !== q.title) v.push({ title: q.rawTitle, artist: q.artist });
  if (firstArtist(q.artist) !== q.artist) v.push({ title: q.title, artist: firstArtist(q.artist) });
  return v;
}
async function biniIdentify(q) {
  if (q.isrc) return json(await get(urlWith("https://lyrics-api.binimum.org/", { isrc: q.isrc })))?.results?.[0] ?? null;
  const hits = await Promise.all(nameVariants(q).map(v => get(urlWith("https://lyrics-api.binimum.org/", { track: v.title, artist: v.artist, album: q.album, duration: secs(q.durationMs) })).then(b => json(b)?.results?.[0] ?? null).catch(() => null)));
  return hits.find(Boolean) ?? null;
}
async function bini(q, doc, hit) {
  const f = hit ?? await biniIdentify(q);
  return f?.lyricsUrl ? fromTtml(await doc(f.lyricsUrl)) : null;
}
async function betterLyrics(q) {
  const body = await get(urlWith("https://lyrics-api.boidu.dev/getLyrics", { s: q.title, a: q.artist, d: secs(q.durationMs), al: q.album }));
  return body ? parseProvider(body) : null;
}

async function betterLyricsPortato(q) {
  const body = await get(urlWith("https://lyrics-api.boidu.dev/qq/getLyrics", { s: q.title, a: q.artist, d: secs(q.durationMs), al: q.album }));
  return body ? parseProvider(body) : null;
}
async function unison(q) {
  const data = json(await get(urlWith("https://unison.boidu.dev/lyrics", { song: q.title, artist: q.artist, album: q.album, duration: secs(q.durationMs) })));
  const d = data?.success ? data.data : null, text = d?.lyrics?.trim(); if (!text) return null;
  if (d.format?.toLowerCase() === "ttml") return fromTtml(text);
  if (d.syncType?.toLowerCase() === "plain") return fromLines(plainLines(text));
  const e = parseEnhancedLrc(text); return fromLines(e.length ? e : parseLrc(text));
}
const num = v => typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(+v) ? +v : null;
const pickNum = (o, keys) => { for (const k of keys) { const n = num(o?.[k]); if (n !== null) return n; } return null; };
const START_KEYS = ["timestamp", "startTime", "start", "time", "begin", "startMs"], END_KEYS = ["endtime", "endTime", "end", "endMs"];
function fromTimed(arr, durationMs = 0) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const starts = arr.map(it => it && typeof it === "object" ? pickNum(it, START_KEYS) : null).filter(n => n !== null);
  if (!starts.length) return null;
  const k = durationMs > 30000 && Math.max(...starts) <= durationMs / 1000 * 1.05 ? 1000 : 1;
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const start = pickNum(it, START_KEYS), end = pickNum(it, END_KEYS);
    const parts = [it.text, it.syllabus, it.words, it.syllables].find(Array.isArray);
    if (parts) {
      const runs = parts.filter(p => p && typeof p.text === "string" && pickNum(p, START_KEYS) !== null).map(p => {
        const a = pickNum(p, START_KEYS) * k, b = pickNum(p, END_KEYS);
        return { startMs: a, endMs: b !== null ? b * k : a + (num(p.duration) ?? 0) * k, raw: p.text };
      });
      const words = wordsFromRuns(runs, true);
      if (words.length) { out.push(line(Math.min(start !== null ? start * k : words[0].startMs, words[0].startMs), words.map(w => w.text).join(" "), { words })); continue; }
    }
    const text = [it.text, it.line, it.lyric, it.content].find(t => typeof t === "string") ?? "";
    if (start !== null) out.push(line(start * k, text.trim(), { sungUntilMs: end !== null ? end * k : null }));
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out.some(l => l.text) ? { lines: withInstrumentalGaps(out) } : null;
}
const asList = r => Array.isArray(r) ? r : [r?.data, r?.results, r?.songs, r?.result?.songs, r?.candidates, r?.items].find(Array.isArray) ?? [];
const fromBody = (body, q) => {
  if (!body) return null;
  const j = json(body);
  if (Array.isArray(j)) return fromTimed(j, q.durationMs);
  for (const key of ["lyrics", "data", "result", "lines"]) if (Array.isArray(j?.[key])) { const t = fromTimed(j[key], q.durationMs); if (t) return t; }
  return parseProvider(body);
};

async function simpmusic(q) {
  if (!q.videoId) return null;
  const r = json(await get(`https://api-lyrics.simpmusic.org/v1/${encodeURIComponent(q.videoId)}`));
  const items = asList(r).concat(r?.data && !Array.isArray(r.data) ? [r.data] : []).filter(x => x && typeof x === "object");
  const want = secs(q.durationMs);
  items.sort((a, b) => Math.abs((num(a.durationSeconds) ?? want ?? 0) - (want ?? 0)) - Math.abs((num(b.durationSeconds) ?? want ?? 0) - (want ?? 0)));
  for (const d of items) {
    const rich = typeof d.richSyncLyrics === "string" ? d.richSyncLyrics.trim() : "";
    if (rich) {
      const j = json(rich), t = Array.isArray(j) ? fromTimed(j, q.durationMs) : null;
      if (t) return t;
      const e = parseEnhancedLrc(rich); if (e.length) return { lines: e };
    }
    const synced = typeof d.syncedLyrics === "string" ? d.syncedLyrics.trim() : "";
    if (synced) { const l = parseLrc(synced); if (l.length) return { lines: l }; }
  }
  const plain = items.map(d => d.plainLyric ?? d.plainLyrics).find(t => typeof t === "string" && t.trim());
  return plain ? fromLines(plainLines(plain)) : null;
}

const PAX = "https://lyrics.paxsenix.org";
const paxPick = (list, q) => {
  const want = q.durationMs, dur = it => { const n = pickNum(it, ["duration", "durationMs", "time"]); return n === null ? 0 : n < 1000 ? n * 1000 : n; };
  const ranked = list.map(it => ({ it, d: want && dur(it) ? Math.abs(dur(it) - want) : 0 })).sort((a, b) => a.d - b.d);
  return (ranked.find(x => !want || x.d <= 6000) ?? null)?.it ?? null;
};
async function paxsenix(q) {
  const query = `${q.title} ${q.artist}`;
  const am = paxPick(asList(json(await get(urlWith(`${PAX}/apple-music/search`, { q: query })))), q);
  const amId = am?.id ?? am?.songId;
  if (amId) {
    const t = fromBody(await get(urlWith(`${PAX}/apple-music/lyrics`, { id: amId, ttml: "true" })), q);
    if (t) return t;
  }
  const ne = paxPick(asList(json(await get(urlWith(`${PAX}/netease/search`, { q: query })))), q);
  const neId = ne?.id ?? ne?.songId;
  return neId ? fromBody(await get(urlWith(`${PAX}/netease/lyrics`, { id: neId })), q) : null;
}
async function musixmatch(q) {
  const base = { t: q.title, a: q.artist, d: secs(q.durationMs) };
  for (const type of ["word", "default"]) {
    const t = fromBody(await get(urlWith(`${PAX}/musixmatch/lyrics`, { ...base, type })), q);
    if (t) return t;
  }
  return null;
}

const b64text = b => { const bin = atob(b.replace(/\s/g, "")); return new TextDecoder("utf-8").decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
async function kugou(q) {
  const found = json(await get(urlWith("https://lyrics.kugou.com/search", { ver: 1, man: "yes", client: "pc", keyword: `${q.artist} - ${q.title}`, duration: q.durationMs || "", hash: "" })));
  const c = paxPick(asList(found), q);
  if (!c?.id || !c?.accesskey) return null;
  const d = json(await get(urlWith("https://lyrics.kugou.com/download", { ver: 1, client: "pc", id: c.id, accesskey: c.accesskey, fmt: "lrc", charset: "utf8" })));
  if (!d?.content) return null;
  let text; try { text = b64text(d.content); } catch { return null; }
  const e = parseEnhancedLrc(text), l = e.length ? e : parseLrc(text);
  return l.length ? { lines: l } : null;
}

const decodeHtml = t => t.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
async function megalobiz(q) {
  const html = await get(urlWith("https://www.megalobiz.com/search/all", { qry: `${q.artist} ${q.title}`, "searchButton.x": 0, "searchButton.y": 0 }));
  if (!html) return null;
  const hits = [...html.matchAll(/<a[^>]+href="(\/lrc\/maker\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: m[1], title: decodeHtml(m[2]).trim() }));
  const want = norm(q.title), ranked = hits.filter(h => norm(h.title).includes(want)).concat(hits.filter(h => !norm(h.title).includes(want)));
  for (const h of ranked.slice(0, 3)) {
    const page = await get(new URL(h.href, "https://www.megalobiz.com").toString());
    const m = page && /<span[^>]+id="lrc_\d+_lyrics"[^>]*>([\s\S]*?)<\/span>/i.exec(page);
    if (!m) continue;
    const text = decodeHtml(m[1]), e = parseEnhancedLrc(text), l = e.length ? e : parseLrc(text);
    if (l.length) return { lines: l };
  }
  return null;
}
const MIRRORS = ["https://lyricsplus.prjktla.my.id", "https://lyricsplus.binimum.org"];
let goodMirror = null;
function parseLyricsPlus(r) {
  const sung = [];
  for (const l of r.lyrics ?? []) {
    if (typeof l.time !== "number") continue;
    const words = wordsFromRuns((l.syllabus ?? []).filter(s => typeof s.text === "string" && typeof s.time === "number").map(s => ({ startMs: s.time, endMs: s.time + (s.duration ?? 0), raw: s.text })), true);
    let built = null;
    if (words.length) built = line(Math.min(l.time, words[0].startMs), words.map(w => w.text).join(" "), { words });
    else if (l.text?.trim()) built = line(l.time, l.text.trim(), { sungUntilMs: l.duration > 0 ? l.time + l.duration : null });
    if (built) sung.push({ line: built, element: l.element });
  }
  sung.sort((a, b) => a.line.timeMs - b.line.timeMs);
  const types = {};
  for (const [id, a] of Object.entries(r.metadata?.agents ?? {})) if (a.type) types[a.alias ?? id] = a.type;
  const singer = e => e && typeof e === "object" && !Array.isArray(e) && typeof e.singer === "string" ? e.singer : null;
  const sides = lineAlignments(sung.map(s => singer(s.element)), types);
  return withInstrumentalGaps(sung.map((s, i) => ({ ...s.line, alignment: sides[i] === "end" || (Array.isArray(s.element) && s.element.some(t => t === "opposite" || t === "right")) ? "end" : "start" })));
}
const firstArtist = a => a.split(ARTIST_SEP)[0].trim() || a;

async function lyricsPlus(q) {
  const hosts = goodMirror ? [goodMirror, ...MIRRORS.filter(m => m !== goodMirror)] : MIRRORS;
  const variants = [
    { title: q.title, artist: q.artist, duration: secs(q.durationMs), album: q.album, isrc: q.isrc },
    { title: q.title, artist: q.artist, isrc: q.isrc },
    ...nameVariants(q).slice(1).map(v => ({ ...v, duration: secs(q.durationMs), isrc: q.isrc })),
    ...nameVariants(q).map(v => ({ ...v })),
  ];
  const seen = new Set(), jobs = [];
  for (const v of variants) for (const host of hosts) { const url = urlWith(`${host}/v2/lyrics/get`, v); if (!seen.has(url)) { seen.add(url); jobs.push({ host, url }); } }
  return new Promise(resolve => {
    let pending = jobs.length, done = false;
    for (const { host, url } of jobs) (async () => {
      const body = json(await get(url));
      const lines = body ? parseLyricsPlus(body) : [];
      if (!done && lines.length) { done = true; goodMirror = host; resolve({ lines }); }
      if (--pending === 0 && !done) resolve(null);
    })();
  });
}
const NOISE = /\((?:from|feat\.?|official|lyrical|video|audio|remix)[^)]*\)|\[[^\]]*\]|\b(?:official (?:video|audio|music video)|lyrical|full song|4k video)\b/gi;
const clean = s => s.replace(NOISE, " ").split(" | ")[0].replace(/\s+/g, " ").trim() || s;
async function lrclib(q) {
  const title = clean(q.title), artist = clean(q.artist), s = Math.floor(q.durationMs / 1000);
  let synced = json(await get(urlWith("https://lrclib.net/api/get", { track_name: title, artist_name: artist, duration: s })))?.syncedLyrics;
  if (!synced) {
    const hits = json(await get(urlWith("https://lrclib.net/api/search", { track_name: title, artist_name: artist })));
    synced = (hits ?? []).filter(h => h.syncedLyrics?.trim()).sort((a, b) => Math.abs((a.duration ?? 0) - s) - Math.abs((b.duration ?? 0) - s))[0]?.syncedLyrics;
  }
  return synced ? fromLines(parseLrc(synced)) : null;
}

export const SOURCES = [
  { id: "lrc-red", label: "lrc.red", detail: "Tiempos de Apple, sílaba a sílaba" },
  { id: "bini", label: "BiniLyrics", detail: "Tiempos de Apple por grabación" },
  { id: "better-lyrics", label: "BetterLyrics", detail: "Apple Music, palabra a palabra" },
  { id: "better-lyrics-portato", label: "QQ Music · Portato", detail: "Karaoke sincronizado por medio de BetterLyrics" },
  { id: "lyrics-plus", label: "LyricsPlus", detail: "Sílaba a sílaba, en espejos de la comunidad" },
  { id: "unison", label: "Unison", detail: "Aportadas por oyentes" },
  { id: "simpmusic", label: "SimpMusic", detail: "Comunidad, indexadas por vídeo de YouTube" },
  { id: "paxsenix", label: "PaxSenix", detail: "Apple Music y NetEase por PaxSenix" },
  { id: "musixmatch", label: "Musixmatch", detail: "Sincronizadas, por PaxSenix" },
  { id: "kugou", label: "KuGou", detail: "Líneas sincronizadas de KuGou" },
  { id: "megalobiz", label: "Megalobiz", detail: "Aportadas por la comunidad, solo con la extensión" },
  { id: "lrclib", label: "LRCLIB", detail: "Solo líneas, siempre disponible" },
];
const CREDITS = [/\s*[([]\s*(feat|ft|featuring|with)\b[^)\]]*[)\]]/gi, /\s+(feat|ft|featuring)\.?\s+.*$/gi,
  /\s*[([]\s*(official\s*)?(music\s*)?(video|audio|visuali[sz]er|lyrics?\s*video|lyrics?|m\/?v|hd|hq|4k|full\s*song)\s*[)\]]/gi, /\s*[([]\s*official\s*[)\]]/gi];
const forSearch = t => { let n = t; for (const p of CREDITS) n = n.replace(p, " "); return n.replace(/\s+/g, " ").trim().replace(/[,\-–—]+$/, "").trim() || t.trim(); };
const artistForSearch = a => a.replace(/ - Topic$/, "").trim() || a.trim();

export const durationMs = meta => { const m = /(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(meta || ""); return m ? (m[3] ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : (+m[1] * 60 + +m[2])) * 1000 : 0; };

const CREDIT = /[([]\s*(?:feat|ft|featuring|with|con|avec|mit|com)\.?\s+([^)\]]+)[)\]]/i, CREDIT_G = new RegExp(CREDIT.source, "gi");

const JP = { "hatsune miku": "初音ミク", "kasane teto": "重音テト", "kagamine rin": "鏡音リン", "kagamine len": "鏡音レン", "megurine luka": "巡音ルカ" };
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
const cache = new Map();
function toResult(source, parsed) {
  const lines = withBackgroundVocals(parsed.lines);
  return { source, label: SOURCES.find(s => s.id === source)?.label ?? source, lines, wordSynced: lines.some(l => l.words.length), synced: lines.some(l => l.timeMs > 0 || l.words.length) };
}

export async function lookupLyrics(song, { only, onSource } = {}) {
  const sequence = only ? [only] : SOURCES.map(s => s.id);
  const dur = song.durationMs || durationMs(song.meta);
  trace.length = 0;
  const key = `${song.id}|${dur}|${only ?? ""}`;
  const hit = cache.get(key); if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.result;

  const feat = CREDIT.exec(song.title)?.[1]?.trim() || null;
  const q = { rawTitle: song.title.trim(), feat, title: forSearch(song.title.replace(CREDIT_G, " ")), artist: artistForSearch(song.artist), durationMs: dur, album: song.album || null, isrc: null, videoId: song.id || null };
  let ident = null;
  if (sequence.includes("bini")) { ident = await withTimeout(biniIdentify(q).catch(() => null), 2500); if (ident?.isrc) q.isrc = ident.isrc; }
  const docs = new Map(), doc = url => { if (!docs.has(url)) docs.set(url, get(url)); return docs.get(url); };
  const fetchFrom = id => ({ "lrc-red": () => lrcRed(q, doc), bini: () => bini(q, doc, ident), "better-lyrics": () => betterLyrics(q), "better-lyrics-portato": () => betterLyricsPortato(q), "lyrics-plus": () => lyricsPlus(q), unison: () => unison(q), simpmusic: () => withTimeout(simpmusic(q), 5000), paxsenix: () => withTimeout(paxsenix(q), 7000), musixmatch: () => withTimeout(musixmatch(q), 6000), kugou: () => withTimeout(kugou(q), 6000), megalobiz: () => withTimeout(megalobiz(q), 8000), lrclib: () => lrclib(q) })[id]();
  const run = id => { onSource?.(id, "pending"); return fetchFrom(id).catch(() => null).then(p => { const r = p?.lines.some(l => l.text.trim()) ? toResult(id, p) : null; onSource?.(id, r ? "found" : "missing"); return r; }); };
  const racing = sequence.map(id => run(id));
  let plain = null, winner = null;
  for (const job of racing) {
    const f = await job; if (!f) continue;
    if (f.synced) { winner = f; break; }
    plain ??= f;
  }
  winner ??= plain;

  if (winner) cache.set(key, { at: Date.now(), result: winner });
  return winner;
}

export const _t = { parseProvider, parseLrc, parseEnhancedLrc, parseLyricsPlus, bestLrcRedHit, durationMs, forSearch };
