

import { LANG, attach as attachI18n } from "./i18n.js";
import { icon } from "./icons.js";
import { hq } from "./img.js";
import { P, au, toggle, next, prev } from "./player.js";
import { S, isLiked, toggleLike } from "./store.js";
import { wavy } from "./wavy.js";
import { playShapes } from "./shapes.js";
import { lookupLyrics, isGap } from "./lyrics.js";
import { glassFx } from "./glassfx.js";
import { liquid } from "./liquid.js";

const SIZES = { small: [380, 150], medium: [440, 190], large: [560, 240] };
const CAPS = { small: [372, 112], medium: [432, 128], large: [532, 148] };
const GLASS = { small: [420, 196], medium: [490, 232], large: [600, 284] };
const dims = () => ((S.cfg.miniDesign === "capsule" ? CAPS : S.cfg.miniDesign === "glass" ? GLASS : SIZES)[S.cfg.miniSize]) ?? SIZES.medium;
const fmt = s => isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00";
export const miniSupported = () => "documentPictureInPicture" in window;

let pip = null, root = null, opening = false, stopWavy = null, stopShapes = null, stopLiquid = null, mo = null, shown = "", lyr = { id: null, lines: [] };
let note = () => {}, onLike = () => {};
export const bindMini = o => { note = o.toast ?? note; onLike = o.onLike ?? onLike; };

const html = () => `<div class="mp"><div class="mbg"></div><div class="mc">
  <div class="cw"><img class="cov" alt=""></div><i class="glr"></i>
  <div class="rt">
    <div class="mt"><div class="tt"><b data-ti></b><span class="muted" data-ar></span></div><button class="ibtn" data-like aria-label="Me gusta">${icon("heart")}</button></div>
    <div class="mly" data-ly></div>
    <div class="ctl"><div class="btns">
      <button class="ibtn" data-act="prev" aria-label="Anterior">${icon("prev")}</button>
      <button class="play" data-act="toggle" aria-label="Reproducir o pausar">${icon("play", 28)}</button>
      <button class="ibtn" data-act="next" aria-label="Siguiente">${icon("next")}</button></div>
      <div class="wavy-wrap"><span class="t" data-cur>0:00</span><canvas data-wavy></canvas><span class="t" data-dur>0:00</span></div></div>
  </div></div></div>`;

const sync = () => {
  if (!pip) return;
  const r = document.documentElement, p = pip.document.documentElement;
  p.setAttribute("style", r.getAttribute("style") || "");
  for (const a of r.attributes) if (a.name.startsWith("data-")) p.setAttribute(a.name, a.value);
};

function loadLyrics() {
  const s = P.song; if (!S.cfg.miniLyric || !s || !P.media || lyr.id === s.id) return;
  lyr = { id: s.id, lines: [] }; const id = s.id;
  lookupLyrics({ ...s, durationMs: Math.round((P.media.duration || 0) * 1000) })
    .then(r => { if (lyr.id === id && r?.synced) lyr.lines = r.lines; }).catch(() => {});
}

function tick() {
  if (!pip) return;
  const $ = q => root.querySelector(q);
  $("[data-cur]").textContent = fmt(au.currentTime);
  let txt = "";
  if (S.cfg.miniLyric && lyr.id === P.song?.id && lyr.lines.length) {
    const t = au.currentTime * 1000, L = lyr.lines; let lo = 0, hi = L.length - 1, idx = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].timeMs <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
    if (idx >= 0) txt = isGap(L[idx]) ? "♪" : (L[idx].text || (L[idx].words || []).map(w => w.text).join(" "));
  }
  if (txt !== shown) { shown = txt; $("[data-ly]").textContent = txt; }
}

function update() {
  if (!pip) return;
  const s = P.song, $ = q => root.querySelector(q);
  if (!s) return pip.close();
  const mp = $(".mp"), c = $(".cov");
  mp.dataset.size = S.cfg.miniSize; mp.dataset.design = S.cfg.miniDesign; mp.dataset.lyric = S.cfg.miniLyric ? "on" : "off";
  if (c.dataset.id !== s.id) {
    c.dataset.id = s.id; mp.style.setProperty("--cov", `url("${s.cover}")`); c.src = hq(s.cover, 544); c.onerror = () => { c.onerror = null; c.src = s.cover; };
    $("[data-ti]").textContent = s.title; $("[data-ar]").textContent = s.artist; shown = ""; $("[data-ly]").textContent = "";
  }
  $("[data-like]").classList.toggle("on", isLiked(s.id));
  $(".play").innerHTML = icon(au.paused ? "play" : "pause", 28);
  mp.classList.toggle("paused", au.paused);
  $("[data-dur]").textContent = fmt(au.duration);
  const d = dims().join("x");
  if (mp.dataset.dims !== d) { if (mp.dataset.dims) try { pip.resizeTo(...dims()); } catch {} mp.dataset.dims = d; }
  glassFx(pip.document, $(".mc"), S.cfg.miniDesign);
  loadLyrics(); tick();
}
export const refreshMini = update;
P.on(() => update());
au.addEventListener("timeupdate", tick);

function cleanup() { stopWavy?.(); stopShapes?.(); stopLiquid?.(); mo?.disconnect(); stopWavy = stopShapes = stopLiquid = mo = pip = root = null; }

const click = e => {
  const t = e.target.closest("[data-act],[data-like]"); if (!t) return;
  const a = t.dataset.act;
  if (a === "toggle") toggle(); else if (a === "next") next(); else if (a === "prev") prev();
  else if (t.hasAttribute("data-like") && P.song) { toggleLike(P.song); onLike(); update(); }
};

export async function toggleMini() {
  if (pip) return pip.close();
  if (opening) return;
  if (!miniSupported()) return note("El mini reproductor necesita Chrome o Edge 116 o superior.");
  if (!P.song) return note("Pon una canción para abrir el mini reproductor.");
  opening = true;
  try {
    const [width, height] = dims();
    const w = await documentPictureInPicture.requestWindow({ width, height });
    pip = w; root = w.document.body; w.document.documentElement.lang = LANG;
    for (const el of document.head.querySelectorAll("link[rel=stylesheet]")) { const l = w.document.createElement("link"); l.rel = "stylesheet"; l.href = el.href; w.document.head.append(l); }
    root.innerHTML = html();
    attachI18n(w.document);
    sync(); mo = new MutationObserver(sync); mo.observe(document.documentElement, { attributes: true });
    stopWavy = wavy(root.querySelector("[data-wavy]")); stopShapes = playShapes(w.document);
    stopLiquid = liquid(w, root, () => S.cfg.motion);
    root.addEventListener("click", click);
    const glow = root.querySelector(".mc");
    root.addEventListener("pointermove", e => { const r = glow.getBoundingClientRect(); glow.style.setProperty("--mx", e.clientX - r.left + "px"); glow.style.setProperty("--my", e.clientY - r.top + "px"); });
    root.addEventListener("pointerleave", () => { glow.style.setProperty("--mx", "20%"); glow.style.setProperty("--my", "0%"); });
    w.addEventListener("keydown", e => { if (e.code === "Space") { e.preventDefault(); toggle(); } });
    w.addEventListener("resize", () => update());
    w.addEventListener("pagehide", cleanup);
    update();
  } catch (e) { note("No se pudo abrir el mini reproductor: " + e.message); }
  finally { opening = false; }
}

export function setAutoMini() {
  try { navigator.mediaSession.setActionHandler("enterpictureinpicture", S.cfg.miniAuto && miniSupported() ? () => { if (!pip) toggleMini(); } : null); } catch {}
}
