import { resolveStream } from "./yt.js";
import { S, pushHistory, countPlay } from "./store.js";
import { hq } from "./img.js";
import { attachHls } from "./hls.js";
export const au = new Audio();
au.volume = S.cfg.volume;
const subs = new Set();
const AQK = "fm.aq", AQS = ["auto", "high", "medium", "low"];
const storedAq = () => { try { const v = localStorage.getItem(AQK); return AQS.includes(v) ? v : "auto"; } catch { return "auto"; } };
export const AQ = { quality: storedAq() };
export const audioLabel = q => ({ auto: "Auto", high: "Alta", medium: "Media", low: "Baja" })[q] || "Auto";
let reloadGen = 0, resumeAt = 0;
const wantHeight = () => { try { return Number(localStorage.getItem("fm.vq")) || 1080; } catch { return 1080; } };
export const P = { queue: [], idx: -1, loading: false, error: "", media: null, get song() { return this.queue[this.idx]; }, on: f => subs.add(f) };
const emit = () => subs.forEach(f => f());
export async function playList(list, i) { P.queue = [...list]; return playAt(i); }
export async function playAt(i) {
  if (i < 0 || i >= P.queue.length) return;
  reloadGen++; resumeAt = 0;
  P.idx = i; P.loading = true; P.error = ""; P.media = null; resetAudio();
  if (!P.song.cover && P.song.id) P.song.cover = `https://i.ytimg.com/vi/${encodeURIComponent(P.song.id)}/hqdefault.jpg`;
  emit();
  const s = P.song; pushHistory(s); countPlay(s);
  try {
    const st = await resolveStream(s.id, AQ.quality);
    if (P.song !== s) return;
    P.media = st;
    await playSources(st, s);

    if (s.video && st.findVideo && P.song === s && (st.video?.top || 0) < wantHeight()) st.videoLookup = st.findVideo(wantHeight(), st.video?.top || 0).then(v => { if (v && P.media === st && P.song === s && v.top > (st.video?.top || 0)) { st.video = v; emit(); } }).catch(() => {});
  } catch (e) { P.error = /supported source/.test(e.message) ? "El navegador no pudo cargar el audio. " + e.message.replace(/^supported source\s*\|?\s*/, "").slice(0, 300) : e.message; if (P.error) console.error("FrikiMusic:", e); }
  P.loading = false; emit();
}

let trying = false, detachAudio = () => {}, muxedFirstUntil = 0;
const resetAudio = () => { try { detachAudio(); } catch {} detachAudio = () => {}; };
const tryUrl = (url, st, src) => new Promise(async (ok, no) => {
  const done = f => v => { clearTimeout(t); au.removeEventListener("error", bad); f(v); };
  const bad = () => { const m = au.error; done(no)(new Error(`supported source (MediaError ${m?.code ?? "?"}: ${m?.message || "sin detalle"})`)); };
  const t = setTimeout(() => done(no)(new Error("tiempo agotado")), 15000);
  au.addEventListener("error", bad, { once: true });
  resetAudio();
  if (src?.hls) { try { detachAudio = await attachHls(au, url, { audio: AQ.quality }); } catch (e) { return done(no)(e); } }
  else { au.src = url; if (resumeAt > 0) { try { au.currentTime = resumeAt; } catch {} } }
  au.play().then(() => {

    const d = au.duration, exp = st.duration || 0;
    const insane = !st.live && !src?.hls && (!isFinite(d) || (exp > 0 ? d > exp * 1.5 + 30 : d > 6 * 3600));
    if (insane) { au.pause(); return done(no)(new Error(`duración anómala (${isFinite(d) ? Math.round(d) + " s" : "infinita"}, esperada ${Math.round(exp)} s)`)); }
    done(ok)();
  }, e => done(no)(e));
});
async function probeUrl(u, itag) {
  const x = new URL(u), c = x.searchParams.get("c"), pot = x.searchParams.has("pot");
  const get = async range => {
    try {
      const r = await fetch(u, { headers: { Range: range }, credentials: "omit" });
      const cr = r.headers.get("content-range") || "";
      try { r.body?.cancel(); } catch {}
      return `${range} -> ${r.status}${cr ? " [" + cr + "]" : ""}`;
    } catch (e) { return `${range} -> error ${e?.message || e}`; }
  };
  const out = [];
  for (const r of ["bytes=0-1", "bytes=0-", "bytes=1048576-2097151", "bytes=2097152-3145727"]) out.push(await get(r));
  console.info(`FrikiMusic [diag] itag ${itag} c=${c} pot=${pot} || ${out.join(" || ")}`);
}
async function playSources(st, s) {
  trying = true;
  const log = [];
  try {
    const run = async (list, tag) => {
      for (const src of list) {
        if (P.song !== s) return true;
        let u = "";
        try {
          u = await src.url();
          await tryUrl(u, st, src);
          if (src.muxed && (log.length || Date.now() < muxedFirstUntil)) muxedFirstUntil = Date.now() + 10 * 60_000;
          console.info("FrikiMusic: sonando", tag, src.itag, src.mime); st.playing = { bitrate: src.bitrate || 0, mime: src.mime };

          try { const v = src.video?.(); if (v) st.video = v; } catch {}
          return true;
        }
        catch (e) {
          if (e?.name === "AbortError") return true;
          const line = `${tag} itag ${src.itag}${src.muxed ? " (combinado)" : ""}: ${e.name !== "Error" ? e.name + " " : ""}${e.message}`;
          log.push(line); console.warn("FrikiMusic: fuente fallida", s.id, line);
          if (u) probeUrl(u, src.itag);
        }
      }
      return false;
    };
    const ordered = Date.now() < muxedFirstUntil ? [...st.sources.filter(x => x.muxed), ...st.sources.filter(x => !x.muxed)] : st.sources;
    if (await run(ordered, "principal")) return;
    if (P.song !== s) return;
    if (await run(await st.more().catch(e => { log.push("otros clientes: " + e.message); return []; }), "respaldo")) return;
    throw new Error(`supported source | ${s.id} | ${log.join(" || ") || "sin fuentes"}`);
  } finally { trying = false; }
}
async function reloadAudio() {
  const s = P.song, t = au.currentTime, wasPaused = au.paused, run = ++reloadGen;
  P.loading = true; emit();
  try {
    const st = await resolveStream(s.id, AQ.quality);
    if (P.song !== s || run !== reloadGen) return;
    P.media = st;
    resumeAt = st.live ? 0 : t;
    await playSources(st, s);
    if (P.song !== s || run !== reloadGen) return;
    if (wasPaused) au.pause();
  } catch (e) { console.warn("FrikiMusic:", e); }
  if (run === reloadGen) { resumeAt = 0; P.loading = false; emit(); }
}
export function setAudioQuality(q) {
  if (!AQS.includes(q)) q = "auto";
  try { q === "auto" ? localStorage.removeItem(AQK) : localStorage.setItem(AQK, q); } catch {}
  if (q === AQ.quality) return;
  AQ.quality = q;
  if (detachAudio.setAudio) { detachAudio.setAudio(q); emit(); return; }
  if (P.song && P.media && !P.loading) reloadAudio(); else emit();
}
export const toggle = () => au.src && (au.paused ? au.play() : au.pause());
export const next = () => playAt(P.idx + 1);
export const prev = () => au.currentTime > 4 ? (au.currentTime = 0) : playAt(P.idx - 1);
export const seekTo = f => au.duration && (au.currentTime = f * au.duration);
au.addEventListener("ended", () => S.cfg.autonext && next());
["play", "pause", "loadedmetadata"].forEach(e => au.addEventListener(e, emit));
au.addEventListener("error", () => { if (trying) return; P.error = "YouTube rechazó el audio. Prueba otra canción."; emit(); });
if ("mediaSession" in navigator) for (const [a, f] of [["play", toggle], ["pause", toggle], ["previoustrack", prev], ["nexttrack", next]]) navigator.mediaSession.setActionHandler(a, f);
export function updateSession() {
  const s = P.song; if (s && "mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, artwork: [{ src: hq(s.cover, 512), sizes: "512x512" }] });
}
