

import { icon } from "./icons.js";
import { pic, hq, bindCoverFallback } from "./img.js";
import { P, au, toggle, next, prev, AQ, audioLabel, setAudioQuality } from "./player.js";
import { S, isLiked } from "./store.js";
import { wavy } from "./wavy.js";
import { queueRows } from "./views.js";
import { VS, vid, hasVideo, claim, onVideo, qualityLabel, setQuality } from "./video.js";
import { lyricsView } from "./lyricview.js";
import { lookupLyrics, trace } from "./lyrics.js";

const $ = (r, s) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fmt = s => isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00";

export function transport() {
  const pl = !au.paused;
  return `<div class="ctl"><div class="btns"><button class="ibtn" data-act="prev" aria-label="Anterior">${icon("prev")}</button>
    <button class="play" data-act="toggle" aria-label="${pl ? "Pausar" : "Reproducir"}">${icon(pl ? "pause" : "play", 28)}</button>
    <button class="ibtn" data-act="next" aria-label="Siguiente">${icon("next")}</button></div>
    <div class="wavy-wrap"><span class="t" data-cur>${fmt(au.currentTime)}</span><canvas data-wavy></canvas><span class="t" data-dur>${fmt(au.duration)}</span></div></div>`;
}

const dpanel = () => S.cfg.fpanel === "none" ? null : S.cfg.fpanel;
let root, built = false, open = false, panel = "lyrics", picked = false, idle = false, idleTimer = 0, releaseVideo = null, stopWavy = null;
let lv = null, lyricsFor = null, lyricsOnly = null, builtSong = null, lastMode = "", lastQueueKey = "";
let artFxTimer = 0;

function animateArtwork(showLyrics) {
  clearTimeout(artFxTimer);
  root.classList.remove("lyrics-art-in", "lyrics-art-out");

  void root.offsetWidth;
  root.classList.add(showLyrics ? "lyrics-art-in" : "lyrics-art-out");
  artFxTimer = setTimeout(() => root.classList.remove("lyrics-art-in", "lyrics-art-out"), 700);
}

function build() {
  root = document.getElementById("full");
  root.innerHTML = `<div class="vt" data-vt aria-hidden="true"></div>
  <button class="ibtn fc close" data-act="full" aria-label="Cerrar">${icon("down")}</button>
  <div class="ftr"><button class="vq" data-vq aria-haspopup="menu" hidden></button><div class="vqm" data-vqm hidden role="menu"></div>
    ${"documentPictureInPicture" in window ? `<button class="ibtn fc" data-act="mini" aria-label="Mini reproductor" title="Mini reproductor (P)">${icon("pip", 20)}</button>` : ""}
    <button class="ibtn fc" data-fs aria-label="Pantalla completa">${icon("fs", 20)}</button></div>
  <div class="fgrid">
    <section class="fplayer" aria-label="Reproductor">
      <div class="fart"><img class="cov" alt="" decoding="async"><div class="vs" data-vs></div></div>
      <div class="finfo"><div class="tt"><b data-ti></b><button class="muted artist-link" data-ar data-artist="" data-artist-id=""></button></div><button class="ibtn" data-like="" aria-label="Me gusta">${icon("heart")}</button></div>
      <div data-ctl></div>
    </section>
    <section class="fcol" data-col hidden></section>
  </div>
  <button class="ibtn fc lyb" data-panel="lyrics" aria-label="Letras" aria-pressed="false">${icon("lyrics", 20)}</button>
  <div class="fbr"><button class="ibtn fc" data-panel="queue" aria-label="Siguiente" aria-pressed="false">${icon("queue", 20)}</button></div>`;
  lv = lyricsView({ onSeek: t => { if (au.duration) au.currentTime = t; }, onPick: src => { lyricsOnly = src; lyricsFor = null; syncLyrics(); }, onRetry: () => { lyricsFor = null; syncLyrics(); } });
  $(root, "[data-ctl]").innerHTML = transport();
  stopWavy = wavy($(root, "[data-ctl] [data-wavy]"));
  root.addEventListener("pointermove", wake); root.addEventListener("pointerdown", wake); root.addEventListener("keydown", wake);
  root.addEventListener("click", e => {
    const t = e.target.closest("[data-panel],[data-fs],[data-vq],[data-q],[data-aq]");
    if (!t) { menu(false); return; }
    if (t.dataset.panel) {
      const wasLyrics = panel === "lyrics";
      picked = true; panel = panel === t.dataset.panel ? null : t.dataset.panel;
      if (wasLyrics !== (panel === "lyrics")) animateArtwork(panel === "lyrics");
      update();
    }
    else if (t.dataset.fs !== undefined) toggleBrowserFs();
    else if (t.dataset.vq !== undefined) menu();
    else if (t.dataset.q !== undefined) { menu(false); setQuality(t.dataset.q === "auto" ? "auto" : +t.dataset.q); }
    else if (t.dataset.aq !== undefined) { menu(false); setAudioQuality(t.dataset.aq); update(); }
  });
  document.addEventListener("fullscreenchange", () => { const b = $(root, "[data-fs]"); if (b) b.innerHTML = icon(document.fullscreenElement ? "fsx" : "fs", 20); });
  if (!document.fullscreenEnabled) $(root, "[data-fs]").hidden = true;
  onVideo(() => { if (open) update(); });
  built = true;
}

function toggleBrowserFs() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
function menu(show) {
  const m = $(root, "[data-vqm]"); show ??= m.hidden; m.hidden = !show;
  if (!show) return;
  const kbps = P.media?.playing?.bitrate ? Math.round(P.media.playing.bitrate / 1000) + " kbps" : "";
  const video = hasVideo() && VS.heights.length > 1
    ? `<span class="vqh">Vídeo</span><button data-q="auto" role="menuitemradio" aria-checked="${VS.quality === "auto"}">Auto${VS.quality === "auto" && VS.height ? `<i>${qualityLabel(VS.height)}</i>` : ""}</button>`
      + VS.heights.map(h => `<button data-q="${h}" role="menuitemradio" aria-checked="${VS.quality === h}">${qualityLabel(h)}<i>${h}p</i></button>`).join("") + "<hr>"
    : "";
  const hint = { auto: AQ.quality === "auto" ? kbps : "", high: "Máx.", medium: "~128 kbps", low: "Mín." };
  const audio = `<span class="vqh">Audio</span>` + ["auto", "high", "medium", "low"].map(q => `<button data-aq="${q}" role="menuitemradio" aria-checked="${AQ.quality === q}">${audioLabel(q)}<i>${hint[q]}</i></button>`).join("");
  m.innerHTML = video + audio;
}
function wake() {
  idle = false; root.classList.remove("idle"); clearTimeout(idleTimer);
  const ms = S.cfg.idle * 1000; if (ms > 0) idleTimer = setTimeout(() => { idle = true; applyIdle(); }, ms);
}
const applyIdle = () => root.classList.toggle("idle", root.dataset.mode === "theater" && !au.paused && idle);

function syncLyrics() {
  const s = P.song; if (!s || !lv) return;
  const key = s.id + "|" + (lyricsOnly ?? "");
  if (lyricsFor === key) return;
  lyricsFor = key; lv.set("loading");
  const mine = key;
  const secs = P.media?.duration || (au.duration > 0 && isFinite(au.duration) ? au.duration : 0);
  lookupLyrics({ ...s, durationMs: Math.round(secs * 1000) }, { only: lyricsOnly ?? undefined })
    .then(r => { if (lyricsFor === mine) lv.set(r, [...trace]); }).catch(() => { if (lyricsFor === mine) lv.set(null, [...trace]); });
}

function update() {
  if (!open || !built) return;
  const s = P.song; if (!s) return closeFull();
  const f = root;
  if (builtSong !== s.id) {

    if (builtSong !== null && !picked) panel = dpanel();
    builtSong = s.id; lyricsOnly = null; lv.reset(); lyricsFor = null;
    $(f, ".cov").src = hq(s.cover, 1000); $(f, ".cov").dataset.o = s.cover;
    bindCoverFallback($(f, ".cov"), s.id, s.cover);
    f.style.setProperty("--cov", `url("${s.cover}")`);
    $(f, "[data-ti]").textContent = s.title; $(f, "[data-ar]").textContent = s.artist; $(f, "[data-ar]").dataset.artist = s.artist; $(f, "[data-ar]").dataset.artistId = s.artistId || "";
    $(f, "[data-like]").dataset.like = s.id;
  }
  if (hasVideo() && !picked && panel) panel = null;
  const video = hasVideo(), col = panel === "lyrics" || panel === "queue";
  const mode = video ? (col ? "split" : "theater") : "art";
  f.dataset.mode = mode; f.dataset.col = panel || "";

  if (mode !== lastMode) {
    if (mode === "theater") $(f, "[data-vt]").append(vid); else if (mode === "split") $(f, "[data-vs]").append(vid); else vid.remove();
    if (mode !== "art" && !au.paused) vid.play().catch(() => {});
    lastMode = mode;
  }
  $(f, "[data-like]").classList.toggle("on", isLiked(s.id));
  $(f, "[data-ctl] .play").innerHTML = icon(au.paused ? "play" : "pause", 28);
  $(f, "[data-ctl] .play").setAttribute("aria-label", au.paused ? "Reproducir" : "Pausar");
  f.classList.toggle("paused", au.paused);

  const vq = $(f, "[data-vq]");
  vq.hidden = false;
  vq.textContent = video && VS.heights.length > 1 ? qualityLabel(VS.quality === "auto" || !VS.heights.includes(VS.quality) ? VS.height : VS.quality) : "♪ " + audioLabel(AQ.quality);

  const colEl = $(f, "[data-col]"); colEl.hidden = !col;
  $(f, '[data-panel="lyrics"]').setAttribute("aria-pressed", panel === "lyrics");
  $(f, '[data-panel="queue"]').setAttribute("aria-pressed", panel === "queue");
  if (panel === "lyrics") {
    if (colEl.firstChild !== lv.el) { colEl.replaceChildren(lv.el); }
    syncLyrics(); lv.start();
  } else {
    lv.stop();
    if (panel === "queue") {
      const key = P.queue.length + ":" + P.idx;
      if (lastQueueKey !== key || !colEl.classList.contains("q")) { colEl.className = "fcol q"; colEl.innerHTML = queueRows(); lastQueueKey = key; colEl.querySelector(".now")?.scrollIntoView({ block: "center" }); }
      else colEl.classList.add("q");
    } else { lastQueueKey = ""; }
  }
  if (panel !== "queue") colEl.classList.remove("q");
  applyIdle();
}

export const isFullOpen = () => open;
export function openFull() {
  if (!P.song) return;
  if (!built) build();
  open = true; root.hidden = false;
  panel = hasVideo() ? null : dpanel(); picked = false; builtSong = null; lastMode = ""; lyricsFor = null;
  releaseVideo = claim();
  wake(); update();
  $(root, ".close").focus({ preventScroll: true });
}
export function closeFull() {
  if (!built || !open) return;
  open = false; root.hidden = true; lv?.stop(); menu(false); clearTimeout(idleTimer);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  releaseVideo?.(); releaseVideo = null; vid.remove(); lastMode = "";
}
export const toggleFull = () => open ? closeFull() : openFull();
export const updateFull = update;
