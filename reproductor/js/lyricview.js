// Panel de letras: línea activa centrada, barrido palabra a palabra (o sílaba a sílaba) solo si la letra trae tiempos por palabra y clic para saltar.
// Sustituye al <am-lyrics> de BitChord, que necesita compilador; aquí es JS plano sobre el audio.
import { au } from "./player.js";
import { SOURCES, isGap } from "./lyrics.js";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function spans(words) {
  return words.map(w => {
    const parts = w.syllables.length ? w.syllables.map(s => ({ t: w.text.slice(s.startChar, s.endChar), a: s.startMs, b: s.endMs })) : [{ t: w.text, a: w.startMs, b: w.endMs }];
    return `<span class="w">${parts.map(p => `<span class="sy" data-a="${p.a}" data-b="${Math.max(p.b, p.a + 1)}">${esc(p.t)}</span>`).join("")}</span>`;
  }).join(" ");
}
function lineHTML(l, i, synced) {
  if (isGap(l)) return `<div class="ly gap" data-i="${i}" data-t="${l.timeMs}"><i></i><i></i><i></i></div>`;
  // Sin tiempos por palabra no hay barrido: la línea entera se enciende (clase "ln") al empezar su turno
  const lead = l.words.length ? spans(l.words) : `<span class="sy ln">${esc(l.text)}</span>`;
  const bg = l.background ? `<div class="bgv">${l.background.words.length ? spans(l.background.words) : `<span class="sy ln">${esc(l.background.text)}</span>`}</div>` : "";
  return `<div class="ly${l.alignment === "end" ? " end" : ""}${synced ? "" : " plain"}" data-i="${i}" data-t="${l.timeMs}">${lead}${bg}</div>`;
}

export function lyricsView({ onSeek, onPick, onRetry } = {}) {
  const el = document.createElement("div");
  el.className = "lv";
  el.innerHTML = `<div class="lv-scroll" tabindex="-1"></div><div class="lv-foot"><span class="lv-src-l"></span><select class="lv-src" aria-label="Fuente de las letras"><option value="">Automático</option>${SOURCES.map(s => `<option value="${s.id}" title="${esc(s.detail)}">${esc(s.label)}</option>`).join("")}</select></div>`;
  const box = el.querySelector(".lv-scroll"), label = el.querySelector(".lv-src-l"), pick = el.querySelector(".lv-src");
  let lines = [], rows = [], synced = false, active = -2, raf = 0, manualUntil = 0, recenter = false, forced = "";

  pick.onchange = () => { forced = pick.value; onPick?.(forced || null); };
  const manual = () => { manualUntil = performance.now() + 3500; recenter = true; };
  ["wheel", "touchmove", "pointerdown"].forEach(e => box.addEventListener(e, manual, { passive: true }));
  box.addEventListener("click", e => {
    const row = e.target.closest(".ly"); if (!row || !synced || row.classList.contains("gap")) return;
    onSeek?.(Number(row.dataset.t) / 1000); manualUntil = 0;
  });

  function setActive(idx) {
    active = idx;
    rows.forEach((r, i) => { r.classList.toggle("on", i === idx); r.classList.toggle("past", i < idx); });
    if (idx >= 0) center(rows[idx]);
  }
  function center(row) {
    if (!row || performance.now() < manualUntil) return;
    recenter = false;
    box.scrollTo({ top: Math.max(0, row.offsetTop - box.clientHeight * .3), behavior: "smooth" });
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!synced || !lines.length) return;
    const t = au.currentTime * 1000;
    let lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].timeMs <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
    if (idx !== active) setActive(idx);
    else if (recenter && idx >= 0) center(rows[idx]);
    if (idx < 0) return;
    for (const s of rows[idx].querySelectorAll(".sy:not(.ln)")) {
      const a = +s.dataset.a, b = +s.dataset.b;
      s.style.setProperty("--k", t <= a ? 0 : t >= b ? 100 : ((t - a) / (b - a)) * 100);
    }
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  return {
    el, start, stop,
    // Estado: "loading" | "none" | resultado de lookupLyrics
    set(state, log = []) {
      active = -2; rows = []; lines = []; box.scrollTop = 0; label.textContent = "";
      if (state === "loading") { box.innerHTML = `<div class="lv-msg">${"<div class=\"sk\"></div>".repeat(7)}</div>`; return; }
      if (!state) {
        box.innerHTML = `<div class="lv-msg"><b>Sin letras para esta canción</b><span>Prueba otra fuente abajo o reintenta.</span><button class="chip" data-retry>Reintentar</button>${log.length ? `<details open><summary>Qué respondió cada fuente</summary><pre>${esc(log.join("\n"))}</pre></details>` : ""}</div>`;
        box.querySelector("[data-retry]").onclick = () => onRetry?.(); pick.value = forced; return;
      }
      lines = state.lines; synced = state.synced;
      box.innerHTML = lines.map((l, i) => lineHTML(l, i, synced)).join("");
      rows = [...box.querySelectorAll(".ly")];
      label.textContent = `${state.label} · ${state.wordSynced ? "palabra a palabra" : state.synced ? "por líneas" : "sin sincronizar"}`;
      pick.value = forced;
    },
    // Al cambiar de canción se vuelve a "Automático"
    reset() { forced = ""; pick.value = ""; },
    destroy() { stop(); el.remove(); },
  };
}
