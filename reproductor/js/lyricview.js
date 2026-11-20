

import { au } from "./player.js";
import { SOURCES, isGap } from "./lyrics.js";
import { S } from "./store.js";
import { translateLines } from "./translate.js";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function spans(words) {
  return words.map(w => {
    const parts = w.syllables.length ? w.syllables.map(s => ({ t: w.text.slice(s.startChar, s.endChar), a: s.startMs, b: s.endMs })) : [{ t: w.text, a: w.startMs, b: w.endMs }];
    return `<span class="w">${parts.map(p => `<span class="sy" data-a="${p.a}" data-b="${Math.max(p.b, p.a + 1)}">${esc(p.t)}</span>`).join("")}</span>`;
  }).join(" ");
}
function lineHTML(l, i, synced) {
  if (isGap(l)) return `<div class="ly gap" data-i="${i}" data-t="${l.timeMs}"><i></i><i></i><i></i></div>`;

  const lead = l.words.length ? spans(l.words) : `<span class="sy ln">${esc(l.text)}</span>`;
  const bg = l.background ? `<div class="bgv">${l.background.words.length ? spans(l.background.words) : `<span class="sy ln">${esc(l.background.text)}</span>`}</div>` : "";
  return `<div class="ly${l.alignment === "end" ? " end" : ""}${synced ? "" : " plain"}" data-i="${i}" data-t="${l.timeMs}">${lead}${bg}<div class="tr"></div></div>`;
}

export function lyricsView({ onSeek, onPick, onRetry } = {}) {
  const el = document.createElement("div");
  el.className = "lv";
  el.innerHTML = `<div class="lv-scroll" tabindex="-1"></div><div class="lv-foot"><span class="lv-src-l"></span><select class="lv-src" aria-label="Fuente de las letras"><option value="">Automático</option>${SOURCES.map(s => `<option value="${s.id}" title="${esc(s.detail)}">${esc(s.label)}</option>`).join("")}</select></div>`;
  const box = el.querySelector(".lv-scroll"), label = el.querySelector(".lv-src-l"), pick = el.querySelector(".lv-src");
  let lines = [], rows = [], synced = false, active = -2, raf = 0, manualUntil = 0, recenter = false, forced = "", beatKey = "", beatAt = 0, trAbort = null;

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
  function applyTr() {
    trAbort?.abort(); trAbort = null;
    rows.forEach(r => { const t = r.querySelector(".tr"); if (t) t.textContent = ""; });
    const tl = S.cfg.lyTr;
    if (!tl || tl === "off" || !lines.length) return;
    const ctl = trAbort = new AbortController();
    translateLines(lines.map(l => isGap(l) ? "" : l.text), tl, (i, txt) => {
      const t = rows[i]?.querySelector(".tr");
      if (t && txt && txt.toLowerCase() !== lines[i].text.trim().toLowerCase()) t.textContent = txt;
    }, ctl.signal);
  }
  const onTr = () => applyTr();
  document.addEventListener("fm:lytr", onTr);
  function beat(row, idx, t) {
    let key = String(idx), strength = 1;
    const sys = row.querySelectorAll(".sy:not(.ln)");
    if (sys.length) {
      let cur = -1;
      for (let i = 0; i < sys.length; i++) { if (+sys[i].dataset.a <= t) cur = i; else break; }
      key += ":" + cur;
      if (cur > 0) strength = sys[cur].parentElement === sys[cur - 1].parentElement ? .55 : .85;
    }
    const now = performance.now();
    if (key !== beatKey) { beatKey = key; beatAt = now; box.dataset.bs = strength; }
    const v = Math.exp(-(now - beatAt) / 170) * (+box.dataset.bs || 1);
    box.style.setProperty("--beat", S.cfg.lyBeat && !au.paused ? v.toFixed(3) : "0");
  }
  function gapFrame(row, idx, t) {
    const a = lines[idx].timeMs, b = lines[idx + 1] ? lines[idx + 1].timeMs : a + 4000;
    const p = Math.min(1, Math.max(0, (t - a) / Math.max(1, b - a)));
    const dots = row.children;
    for (let n = 0; n < dots.length; n++) {
      const f = Math.min(1, Math.max(0, p * dots.length - n));
      dots[n].style.setProperty("--f", f.toFixed(3));
      dots[n].classList.toggle("done", f >= 1);
    }
    row.classList.toggle("out", b - t < 700);
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
    if (rows[idx].classList.contains("gap")) { box.style.setProperty("--beat", "0"); gapFrame(rows[idx], idx, t); return; }
    beat(rows[idx], idx, t);
    for (const s of rows[idx].querySelectorAll(".sy:not(.ln)")) {
      const a = +s.dataset.a, b = +s.dataset.b;
      s.style.setProperty("--k", t <= a ? 0 : t >= b ? 100 : ((t - a) / (b - a)) * 100);
    }
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  return {
    el, start, stop,

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
      applyTr();
    },

    reset() { forced = ""; pick.value = ""; },
    destroy() { stop(); trAbort?.abort(); document.removeEventListener("fm:lytr", onTr); el.remove(); },
  };
}
