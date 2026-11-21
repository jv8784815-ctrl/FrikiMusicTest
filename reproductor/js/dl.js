// Descargar la canción o el vídeo eligiendo calidad. Diálogo propio: Audio / Vídeo + lista de calidades reales.
// Se baja desde googlevideo por tramos (igual que el reproductor). El vídeo (solo imagen) se une con el audio AAC en el
// navegador (mp4mux.js); las calidades que solo existen en WebM/VP9 no se ofrecen porque no se pueden unir sin ffmpeg.

import { icon } from "./icons.js";
import { downloadFormats } from "./yt.js";
import { fetchSpan, chunkFor } from "./chunked.js";
import { muxMp4 } from "./mp4mux.js";
import { isNative } from "./native.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mb = b => !b ? "" : b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : (b / 1048576 >= 100 ? (b / 1048576).toFixed(0) : (b / 1048576).toFixed(1)) + " MB";
const CODEC = c => /^avc1/.test(c) ? "H.264" : /^av01/.test(c) ? "AV1" : /^vp0?9/.test(c) ? "VP9" : /^mp4a/.test(c) ? "AAC" : /^opus/.test(c) ? "Opus" : c || "";
const hName = h => h >= 4320 ? "8K" : h >= 2160 ? "4K" : h >= 1440 ? "2K" : h >= 1080 ? "Full HD" : h >= 720 ? "HD" : "";
const MAX_BYTES = 1.5e9;                    // un solo ArrayBuffer en memoria
const cache = new Map();                    // videoId -> { at, data }

// ---------- opciones ----------
const tenBit = f => /vp09\.0[23]|av01\.0\.\d+M\.(10|12)/.test(f.mime);
const rank = f => /^avc1/.test(f.codec) ? 0 : /^av01/.test(f.codec) ? 1 : 2;

export function buildOptions(formats) {
  const audio = formats.filter(f => f.hasAudio && !f.hasVideo && !f.drc && !f.dub);
  const audioOpts = [...new Map(audio.map(f => [f.itag, f])).values()].sort((a, b) => b.bitrate - a.bitrate).map(f => {
    const m4a = /^audio\/mp4/.test(f.mime), ext = m4a ? "m4a" : "webm";
    return { id: "a" + f.itag, kind: "audio", parts: [f], ext, mime: m4a ? "audio/mp4" : "audio/webm", title: `${Math.round(f.bitrate / 1000)} kbps`, sub: `${CODEC(f.codec)} · .${ext}`, size: f.size };
  });

  // vídeo: por cada altura, el mejor MP4 (H.264 > AV1) unido con el mejor audio AAC
  const aac = audio.filter(f => /^audio\/mp4/.test(f.mime)).sort((a, b) => b.bitrate - a.bitrate)[0];
  const byH = new Map();
  for (const f of formats) {
    if (!f.hasVideo || f.hasAudio || !f.height || !/^video\/mp4/.test(f.mime) || tenBit(f)) continue;
    const cur = byH.get(f.height);
    if (!cur || rank(f) < rank(cur) || (rank(f) === rank(cur) && (f.fps > cur.fps || (f.fps === cur.fps && f.bitrate > cur.bitrate)))) byH.set(f.height, f);
  }
  const videoOpts = [];
  if (aac) for (const [h, f] of byH) videoOpts.push({ id: "v" + f.itag, kind: "video", parts: [f, aac], ext: "mp4", mime: "video/mp4", h, merge: true,
    title: `${h}p${f.fps > 30 ? f.fps : ""}`, tag: hName(h), sub: `${CODEC(f.codec)} + AAC · .mp4${/^av01/.test(f.codec) ? " · AV1: el Reproductor de Windows necesita el códec AV1 (usa VLC)" : ""}`, size: f.size && aac.size ? f.size + aac.size : 0 });
  // formatos ya con audio (360p/720p), solo para alturas que no tengamos
  for (const f of formats) {
    if (!(f.hasVideo && f.hasAudio) || !f.height || !/^video\/mp4/.test(f.mime) || videoOpts.some(o => o.h === f.height)) continue;
    videoOpts.push({ id: "v" + f.itag, kind: "video", parts: [f], ext: "mp4", mime: "video/mp4", h: f.height, merge: false, title: `${f.height}p`, tag: hName(f.height), sub: `${CODEC(f.codec)} · .mp4`, size: f.size });
  }
  videoOpts.sort((a, b) => b.h - a.h);
  return { audio: audioOpts, video: videoOpts };
}

// ---------- descarga ----------
async function grab(f, url, signal, onBytes) {
  const size = Number(new URL(url).searchParams.get("clen")) || f.size;
  if (!size) throw new Error("YouTube no indicó el tamaño de este archivo. Prueba otra calidad.");
  if (size > MAX_BYTES) throw new Error(`Esta calidad pesa ${mb(size)} y no cabe en la memoria del navegador. Elige una menor.`);
  let buf; try { buf = new Uint8Array(size); } catch { throw new Error(`No hay memoria suficiente para ${mb(size)}. Elige una calidad menor.`); }
  const step = chunkFor(url), win = step * 4;
  for (let a = 0; a < size; a += win) {
    const b = Math.min(a + win, size) - 1;
    buf.set(new Uint8Array(await fetchSpan(url, a, b, step, signal, null)), a); onBytes(b - a + 1);
  }
  return buf;
}
const fileName = (song, o) => {
  const base = `${song.artist ? song.artist + " - " : ""}${song.title || song.id}${o.kind === "video" ? ` [${o.h}p]` : ""}`;
  return base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 150) + "." + o.ext;
};
async function save(blob, name) {
  if (isNative && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { if (e?.name !== "AbortError") throw e; } return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.hidden = true;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}
export async function downloadOption(song, o, { signal, onProgress, onStage }) {
  const urls = await Promise.all(o.parts.map(p => p.url()));
  const sizes = o.parts.map((p, i) => Number(new URL(urls[i]).searchParams.get("clen")) || p.size);
  const total = sizes.reduce((n, x) => n + x, 0); let done = 0;
  const bump = n => { done += n; onProgress(done, total); };
  const bufs = [];
  for (let i = 0; i < o.parts.length; i++) {
    onStage(o.merge ? (i === 0 ? "Descargando vídeo…" : "Descargando audio…") : "Descargando…");
    bufs.push(await grab(o.parts[i], urls[i], signal, bump));
  }
  let blob;
  if (o.merge) { onStage("Uniendo vídeo y audio…"); await new Promise(r => setTimeout(r, 30)); blob = new Blob(muxMp4(bufs[0], bufs[1]), { type: o.mime }); }
  else blob = new Blob(bufs, { type: o.mime });
  const name = fileName(song, o); onStage("Guardando…"); await save(blob, name); return name;
}

// ---------- diálogo ----------
let ov = null, S = null;
const $ = s => ov.querySelector(s);
export function closeDownload() { if (!ov) return; S?.ctl?.abort(); document.removeEventListener("keydown", onKey, true); ov.remove(); ov = S = null; }
const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeDownload(); } };
export const downloadOpen = () => !!ov;

const optHTML = (o, sel) => `<button type="button" class="dl-opt${o.id === sel ? " on" : ""}" data-dl-opt="${o.id}" role="radio" aria-checked="${o.id === sel}">
  <i class="dl-dot" aria-hidden="true"></i><span class="dl-t"><b>${esc(o.title)}${o.tag ? `<em>${o.tag}</em>` : ""}</b><span>${esc(o.sub)}</span></span><span class="dl-sz">${mb(o.size)}</span></button>`;

function render() {
  const s = S.song, list = S.opts ? S.opts[S.tab] : [], sel = S.sel;
  const tabs = s.video ? `<div class="dl-tabs" role="tablist">${["video", "audio"].map(k => `<button type="button" role="tab" data-dl-tab="${k}" aria-selected="${S.tab === k}">${k === "video" ? "Vídeo" : "Solo audio"}</button>`).join("")}</div>` : "";
  let body;
  if (S.err) body = `<p class="dl-msg err">${esc(S.err)}</p><div class="dl-acts"><button type="button" class="chip" data-dl-retry>Reintentar</button></div>`;
  else if (!S.opts) body = `<p class="dl-msg"><span class="dl-spin" aria-hidden="true"></span>Buscando las calidades disponibles…</p>`;
  else if (!list.length) body = `<p class="dl-msg">${S.tab === "video" ? "YouTube no ofrece ningún vídeo descargable para este contenido. Prueba con «Solo audio»." : "YouTube no ofrece audio descargable para este contenido."}</p>`;
  else body = `<div class="dl-list" role="radiogroup" aria-label="Calidad">${list.map(o => optHTML(o, sel)).join("")}</div>`
    + (S.tab === "video" ? `<p class="dl-note">El vídeo se descarga y se une con el audio aquí mismo (MP4 estándar, compatible con el Reproductor de Windows), así que puede tardar un poco en calidades altas.</p>` : "");
  ov.querySelector(".dl-body").innerHTML = tabs + body;
  const go = $("[data-dl-go]"); go.disabled = !sel || S.busy || !list.length;
}
const pick = () => { const l = S.opts?.[S.tab] || []; S.sel = l.find(o => o.id === S.sel)?.id || l[0]?.id || null; };

async function load() {
  S.err = ""; S.opts = null; render();
  try {
    let hit = cache.get(S.song.id);
    if (!hit || Date.now() - hit.at > 20 * 60_000) { hit = { at: Date.now(), data: await downloadFormats(S.song.id) }; cache.set(S.song.id, hit); }
    if (!ov || hit.data == null) return;
    S.opts = buildOptions(hit.data.formats); pick(); render();
  } catch (e) { if (ov) { S.err = e.message || "No se pudieron obtener las calidades."; render(); } }
}
function status(text, pct, cls = "", num = "") {
  const p = $(".dl-prog"); p.hidden = !text; p.className = "dl-prog " + cls;
  $("[data-stage]").textContent = text || ""; $("[data-num]").textContent = num ? " " + num : ""; $(".dl-bar i").style.width = pct == null ? "100%" : Math.round(pct * 100) + "%";
  $(".dl-bar").classList.toggle("ind", pct == null);
}
async function start() {
  const o = S.opts?.[S.tab]?.find(x => x.id === S.sel); if (!o || S.busy) return;
  S.busy = true; S.ctl = new AbortController(); render();
  const cancel = $("[data-dl-cancel]"); cancel.hidden = false; $("[data-dl-go]").hidden = true;
  let stage = "Preparando…"; status(stage, 0);
  try {
    const name = await downloadOption(S.song, o, {
      signal: S.ctl.signal, onStage: t => { stage = t; status(t, t.startsWith("Uniendo") || t.startsWith("Guardando") ? null : 0); },
      onProgress: (d, t) => status(stage, t ? d / t : null, "", `${t ? Math.round(d / t * 100) + "% · " : ""}${mb(d)}${t ? " / " + mb(t) : ""}`),
    });
    status("Listo:", 1, "ok", name);
  } catch (e) {
    if (e?.name === "AbortError" || S.ctl.signal.aborted) status("Descarga cancelada.", 0);
    else { console.error("FrikiMusic [descarga]", e); status(e.message || "No se pudo descargar. Prueba otra calidad.", 0, "err"); }
  }
  if (!ov) return;
  S.busy = false; S.ctl = null; cancel.hidden = true; $("[data-dl-go]").hidden = false; render();
}

export function openDownload(song) {
  if (!song?.id) return;
  closeDownload();
  S = { song, tab: song.video ? "video" : "audio", opts: null, sel: null, busy: false, ctl: null, err: "" };
  ov = document.createElement("div"); ov.className = "dl-ov";
  ov.innerHTML = `<div class="dl-card" role="dialog" aria-modal="true" aria-label="Descargar">
    <header class="dl-head"><img alt="" src="${esc(song.cover || "")}"><div><b>${esc(song.title)}</b><span>${esc(song.artist || "")}</span></div>
      <button type="button" class="ibtn" data-dl-x aria-label="Cerrar">${icon("close", 20)}</button></header>
    <div class="dl-body"></div>
    <div class="dl-prog" hidden><span class="dl-ptxt"><span data-stage></span><span data-num translate="no"></span></span><div class="dl-bar"><i></i></div></div>
    <footer class="dl-foot"><button type="button" class="chip" data-dl-cancel hidden>Cancelar</button><button type="button" class="chip fill" data-dl-go>${icon("download", 20)}Descargar</button></footer></div>`;
  ov.addEventListener("click", e => {
    if (e.target === ov || e.target.closest("[data-dl-x]")) return closeDownload();
    const t = e.target.closest("[data-dl-opt],[data-dl-tab],[data-dl-go],[data-dl-cancel],[data-dl-retry]"); if (!t) return;
    const d = t.dataset;
    if (d.dlOpt && !S.busy) { S.sel = d.dlOpt; render(); }
    else if (d.dlTab && !S.busy) { S.tab = d.dlTab; pick(); render(); }
    else if (d.dlGo !== undefined) start();
    else if (d.dlCancel !== undefined) S.ctl?.abort();
    else if (d.dlRetry !== undefined) load();
  });
  document.body.append(ov); document.addEventListener("keydown", onKey, true);
  $("[data-dl-go]").focus({ preventScroll: true });
  load();
}
