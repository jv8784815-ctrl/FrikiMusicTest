// Traducción en tiempo de ejecución: el código fuente está en español y aquí se
// traduce el DOM (textos, title, aria-label, placeholder, alt) al idioma del navegador.
const KEY = "fm.lang";
export const LANGS = [["es", "Español"], ["en", "English"], ["pt", "Português"], ["fr", "Français"]];
const DICTS = { en: () => import("./i18n/en.js"), pt: () => import("./i18n/pt.js"), fr: () => import("./i18n/fr.js") };

const stored = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const langPref = () => stored() || "auto";
const detect = () => {
  const s = stored();
  const l = (s && s !== "auto" ? s : (navigator.languages?.[0] || navigator.language || "es")).toLowerCase().split("-")[0];
  return l === "es" || DICTS[l] ? l : "en";
};
export const LANG = detect();
export function setLangPref(v) { try { v === "auto" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch {} location.reload(); }

let exact = new Map(), patterns = [];
const cache = new Map();
const SKIP = '[translate="no"], .lv-scroll, script, style, textarea';
const ATTRS = ["title", "aria-label", "placeholder", "alt"];
const sentences = s => s.split(/(?<=[.!?…])\s+/);

function lookup(core) {
  if (exact.has(core)) return exact.get(core);
  for (const [re, to] of patterns) { const m = re.exec(core); if (m) return to.replace(/\$(\d)/g, (_, i) => m[i] ?? ""); }
  return null;
}
export function t(str) {
  if (LANG === "es" || typeof str !== "string") return str;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str), core = m[2];
  if (!core) return str;
  let out = cache.get(core);
  if (out === undefined) {
    out = lookup(core);
    if (out == null) {
      const parts = sentences(core);
      if (parts.length > 1) { let hit = false; const tr = parts.map(p => { const r = lookup(p); if (r != null) hit = true; return r ?? p; }); out = hit ? tr.join(" ") : core; }
      else out = core;
    }
    cache.set(core, out);
  }
  return m[1] + out + m[3];
}

const made = new WeakMap();
function text(n) {
  const v = n.nodeValue; if (made.get(n) === v) return;
  const p = n.parentElement; if (!p || p.closest(SKIP)) return;
  const o = t(v); if (o !== v) { made.set(n, o); n.nodeValue = o; }
}
function attrs(el) {
  if (el.closest?.('[translate="no"], .lv-scroll')) return;
  for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const o = t(v); if (o !== v) el.setAttribute(a, o); } }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) return text(root);
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (root.closest(SKIP)) return; attrs(root); }
  const doc = root.ownerDocument || root, w = doc.createTreeWalker(root, 1 | 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) text(n); else if (!n.closest(SKIP)) attrs(n); }
}
const seen = new WeakSet();
export function attach(doc = document) {
  if (LANG === "es" || seen.has(doc)) return; seen.add(doc);
  doc.documentElement.lang = LANG;
  walk(doc.body || doc.documentElement);
  if (doc.title) { const o = t(doc.title); if (o !== doc.title) doc.title = o; }
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") text(m.target);
      else if (m.type === "attributes") attrs(m.target);
    }
  }).observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

if (LANG !== "es") {
  try {
    const d = (await DICTS[LANG]()).default;
    exact = new Map(Object.entries(d.exact));
    patterns = d.patterns.map(([re, to]) => [new RegExp(re), to]);
  } catch (e) { console.warn("FrikiMusic: no se pudo cargar el idioma", LANG, e); }
  for (const f of ["alert", "confirm", "prompt"]) { const o = window[f].bind(window); window[f] = (m, ...r) => o(t(String(m ?? "")), ...r); }
  attach(document);
}
