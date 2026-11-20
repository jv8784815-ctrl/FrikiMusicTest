// Videoclip de la canción, como Apple Music y BitChord (state/video.ts + playback/youtube/videoDeck.ts):
// un único <video> mudo que sigue al audio. El audio manda el tiempo; la imagen lo persigue ajustando su
// velocidad si se desvía poco y saltando si se desvía mucho. Solo se descarga mientras haya una superficie que lo muestre.
import { au, P } from "./player.js";
import { S } from "./store.js";
import { attachHls } from "./hls.js";

const KEY = "fm.vq", SEEK_DRIFT = .8, IGNORE_DRIFT = .04, SYNC_MS = 250;
const stored = () => { const h = Number(localStorage.getItem(KEY)); return h > 0 ? h : "auto"; };
export const VS = { id: null, ready: false, height: null, heights: [], quality: stored(), surfaces: 0 };
const subs = new Set(); export const onVideo = f => subs.add(f);
const emit = () => subs.forEach(f => f());
export const vid = document.createElement("video");
vid.muted = true; vid.playsInline = true; vid.disablePictureInPicture = true; vid.preload = "auto"; vid.setAttribute("aria-hidden", "true");
vid.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;background:#000";

export const hasVideo = () => VS.ready && !!P.song && VS.id === P.song.id;
export const qualityLabel = h => h >= 4320 ? "8K" : h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 1080 ? "FullHD" : h >= 720 ? "HD" : h + "p";
export function setQuality(q) {
  if (q === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(q));
  VS.quality = q; refresh();
}
// Quien muestre el vídeo lo pide aquí; con cero superficies no se descarga nada.
export function claim() { VS.surfaces++; refresh(); return () => { VS.surfaces--; refresh(); }; }

let gen = 0, loadedKey = null, timer = null, detachVid = () => {};
const failed = new Set(), useMuxed = new Set(); // useMuxed: canciones cuyo vídeo adaptativo no abrió; se usa el formato combinado
async function unload() {
  clearInterval(timer); timer = null; loadedKey = null; try { detachVid(); } catch {} detachVid = () => {};
  if (vid.getAttribute("src")) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
  if (VS.ready || VS.id) { VS.ready = false; VS.id = null; VS.height = null; VS.heights = []; emit(); }
}
export async function refresh() {
  const song = P.song, offer = P.media?.video;
  if (!song || !offer || !S.cfg.video || VS.surfaces <= 0 || failed.has(song.id)) { gen++; return unload(); }
  const key = `${song.id}:${VS.quality}`;
  if (key === loadedKey) return;
  if (offer.hls && VS.ready && VS.id === song.id && detachVid.setHeight) {
    loadedKey = key; detachVid.setHeight(VS.quality); VS.height = detachVid.current() || VS.height; emit(); return;
  }
  const run = ++gen;
  const resumeAt = au.currentTime;
  loadedKey = key;
  try {
    const { url, height, hls } = useMuxed.has(song.id) && offer.muxed ? await offer.muxed() : await offer.pick(VS.quality);
    if (run !== gen) return;
    try { detachVid(); } catch {} detachVid = () => {};
    if (hls) detachVid = await attachHls(vid, url, { height: VS.quality, onLevel: () => { if (VS.ready && VS.id === song.id) { VS.height = detachVid.current?.() || VS.height; emit(); } } }); else vid.src = url;
    if (run !== gen) { try { detachVid(); } catch {} return; }
    // Cuánto del hueco hay que ir por delante: lo que tarda en abrir el punto pedido
    const lead = .6;
    await new Promise((ok, no) => {
      const off = () => ["loadedmetadata", "canplay", "error"].forEach(e => vid.removeEventListener(e, on[e]));
      const on = {
        // En cuanto hay metadatos se pide directamente el punto del audio: así se baja desde ahí, sin pasar por el principio
        loadedmetadata: () => { vid.currentTime = Math.max(0, au.currentTime + lead); },
        canplay: () => { if (vid.readyState >= 3) { off(); ok(); } },
        error: () => { off(); no(vid.error || new Error("vídeo")); },
      };
      for (const e in on) vid.addEventListener(e, on[e]);
      setTimeout(() => { off(); vid.readyState >= 2 ? ok() : no(new Error("tiempo agotado")); }, 12000);
    });
    if (run !== gen) return;
    // Hay búfer en el punto correcto: se coloca justo con el audio y recién entonces se enseña
    vid.playbackRate = au.playbackRate;
    if (!au.paused) await vid.play().catch(() => {});
    if (Math.abs(vid.currentTime - au.currentTime) > .25) vid.currentTime = au.currentTime + .1;
    lastSeek = performance.now();
    Object.assign(VS, { id: song.id, ready: true, height: hls ? (detachVid.current?.() || detachVid.heights?.[0] || 0) : height, heights: hls ? (detachVid.heights || []) : useMuxed.has(song.id) ? [height] : offer.heights });
    sync(); clearInterval(timer); timer = setInterval(sync, SYNC_MS); emit();
  } catch (e) {
    if (run !== gen) return;
    console.warn("FrikiMusic: no se pudo cargar el vídeo", e);
    loadedKey = null;
    if (offer.muxed && !useMuxed.has(song.id)) { useMuxed.add(song.id); return refresh(); }
    // Una altura que este equipo no reproduce no debe costar la imagen: vuelve a Auto (H.264).
    if (VS.quality !== "auto") { setQuality("auto"); return; }
    failed.add(song.id); unload();
  }
}
// Mismo estado de reproducción, misma velocidad, mismo instante que el audio.
// Se evita saltar: un salto obliga a reabrir la descarga y se nota como tirón. Solo se salta si el desvío es grande
// y no hubo otro salto hace poco; el resto se corrige acelerando o frenando un poco la imagen.
let lastSeek = 0;
function sync() {
  if (!VS.ready || !au.src || vid.readyState < 1) return;
  if (au.paused) { if (!vid.paused) vid.pause(); if (Math.abs(vid.currentTime - au.currentTime) > .1) vid.currentTime = au.currentTime; return; }
  if (vid.paused) { vid.play().catch(() => {}); return; }
  if (vid.readyState < 3) return;            // sin datos suficientes: se espera, no se toca el tiempo
  const drift = vid.currentTime - au.currentTime, now = performance.now();
  if (Math.abs(drift) > SEEK_DRIFT) {
    if (now - lastSeek > 2500) { vid.currentTime = au.currentTime + (drift < 0 ? .15 : 0); lastSeek = now; }
    vid.playbackRate = au.playbackRate;
  } else {
    const nudge = Math.abs(drift) > IGNORE_DRIFT ? Math.max(-.05, Math.min(.05, -drift * .5)) : 0;
    vid.playbackRate = au.playbackRate * (1 + nudge);
  }
}
["play", "pause", "ratechange"].forEach(e => au.addEventListener(e, sync));
// El usuario salta en la canción: la imagen va al nuevo punto de inmediato
au.addEventListener("seeked", () => { if (VS.ready) { vid.currentTime = au.currentTime + .1; lastSeek = performance.now(); } });
// Cambio de canción: cae la imagen anterior de inmediato y se pide la nueva
P.on(() => { if (VS.id && P.song?.id !== VS.id) unload(); refresh(); });
