// Buscador: barra con sugerencias, búsquedas recientes, atajos de teclado y filtros de resultados.
// La vista de resultados (search() en views.js) solo pinta; aquí vive todo lo interactivo.
import { icon } from "./icons.js";
import { S, save } from "./store.js";
import { V } from "./views.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ICON = { r: "history", a: "person", s: "note" };
let run = () => {}, redraw = () => {}, items = [], act = -1;

export const searchBarHTML = q => `${icon("search")}
  <input id="q" role="combobox" aria-expanded="false" aria-controls="slist" aria-autocomplete="list" placeholder="Busca canciones, artistas o vídeos…" aria-label="Buscar" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="${esc(q)}">
  <button type="button" class="ibtn sx" data-sclr aria-label="Borrar búsqueda">${icon("close", 20)}</button>
  <i class="spin" aria-hidden="true"></i><kbd class="kbd" aria-hidden="true">/</kbd>
  <div class="sug" id="sug" hidden></div>`;

export const setBusy = b => $("#searchForm")?.classList.toggle("busy", !!b);
const syncHas = () => $("#searchForm")?.classList.toggle("has", !!$("#q")?.value);

// Sugerencias. Sin texto: tus búsquedas recientes. Con texto: recientes que coinciden + artistas y canciones de tu biblioteca (historial y favoritos).
export function suggest(text) {
  const t = norm(text).trim(), out = [], seen = new Set([t]);
  const add = (q, kind, label = q, sub = "") => { const k = norm(q); if (!q || seen.has(k) || out.length >= 8) return; seen.add(k); out.push({ q, kind, label, sub }); };
  if (!t) { S.recent.forEach(r => add(r, "r")); return out; }
  S.recent.filter(r => norm(r).includes(t)).slice(0, 4).forEach(r => add(r, "r"));
  const lib = [...S.history, ...S.likes];
  for (const s of lib) if (s.artist && norm(s.artist).includes(t)) add(s.artist, "a");
  for (const s of lib) if (s.title && norm(s.title).includes(t)) add(`${s.title} ${s.artist || ""}`.trim(), "s", s.title, s.artist);
  return out;
}

const box = () => $("#sug");
export function closeSug() { const b = box(); if (b) { b.hidden = true; b.innerHTML = ""; } $("#q")?.setAttribute("aria-expanded", "false"); $("#q")?.removeAttribute("aria-activedescendant"); act = -1; }
function render() {
  const inp = $("#q"), b = box(); if (!inp || !b) return;
  const text = inp.value, onStart = location.hash === "#/search" && !V.q && !V.loading; // en la pantalla de inicio de Buscar los recientes ya se ven en la página
  items = suggest(text); act = -1;
  if (!items.length || document.activeElement !== inp || (!text.trim() && onStart)) return closeSug();
  const head = text.trim() ? "" : `<div class="sh"><span>Búsquedas recientes</span><button type="button" class="lnk" data-sclear>Borrar todo</button></div>`;
  b.innerHTML = head + `<div id="slist" role="listbox" aria-label="Sugerencias">` + items.map((x, i) => `<div class="si" role="option" id="so${i}" aria-selected="false" data-sq="${esc(x.q)}">${icon(ICON[x.kind])}<span>${esc(x.label)}${x.sub ? `<em>${esc(x.sub)}</em>` : ""}</span>`
    + (x.kind === "r" ? `<button type="button" tabindex="-1" data-sdel="${esc(x.q)}" aria-label="Quitar “${esc(x.q)}” de recientes">${icon("close", 18)}</button>` : `<button type="button" tabindex="-1" data-sfill="${esc(x.q)}" aria-label="Usar “${esc(x.q)}” en la barra">${icon("fill", 18)}</button>`) + `</div>`).join("") + `</div>`;
  b.hidden = false; inp.setAttribute("aria-expanded", "true");
}
function move(d) {
  const n = items.length + 1; act = ((act + 1 + d + n) % n) - 1; // da la vuelta pasando por "ninguna" (-1)
  box().querySelectorAll(".si").forEach((el, i) => { el.classList.toggle("on", i === act); el.setAttribute("aria-selected", i === act); });
  const inp = $("#q"); act >= 0 ? (inp.setAttribute("aria-activedescendant", "so" + act), $("#so" + act).scrollIntoView({ block: "nearest" })) : inp.removeAttribute("aria-activedescendant");
}
export function focusBar() { const i = $("#q"); if (i) { i.focus(); i.select(); } }
const clear = () => { const i = $("#q"); i.value = ""; syncHas(); i.focus(); render(); };

export function bindSearch({ run: r, redraw: d }) {
  run = r; redraw = d;
  const form = $("#searchForm");
  form.addEventListener("input", e => { if (e.target.id === "q") { syncHas(); render(); } });
  form.addEventListener("focusin", e => { if (e.target.id === "q") render(); });
  form.addEventListener("focusout", e => { if (!form.contains(e.relatedTarget)) closeSug(); });
  form.addEventListener("mousedown", e => { if (e.target.closest("#sug")) e.preventDefault(); }); // clicar una sugerencia no le quita el foco al campo
  form.addEventListener("keydown", e => {
    if (e.target.id !== "q") return;
    const open = !box().hidden;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!open) render(); if (box().hidden) return; e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Enter" && open && act >= 0) { e.preventDefault(); run(items[act].q); }
    else if (e.key === "Escape") { if (open) closeSug(); else if (e.target.value) clear(); else e.target.blur(); }
  });
  document.addEventListener("keydown", e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.altKey || !$("#full").hidden) return;
    if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); focusBar(); } // "/" lleva Shift en teclados en español: no se comprueba
  });
  document.addEventListener("click", e => {
    if (e.target.closest('#rail a[href="#/search"]')) { // un segundo clic en "Buscar" estando en los resultados vuelve a la pantalla de inicio (recientes y géneros)
      if (location.hash === "#/search" && V.q && !V.loading) { Object.assign(V, { q: "", results: [], err: "", filter: "all" }); $("#q").value = ""; syncHas(); redraw(); }
      setTimeout(focusBar, 0);
    }
    const t = e.target.closest("[data-sdel],[data-sfill],[data-sclear],[data-sclr],[data-sq],[data-sf],[data-sretry]"); if (!t) return;
    const d = t.dataset, inSug = !!t.closest("#sug");
    if (d.sdel !== undefined) { S.recent = S.recent.filter(x => x !== d.sdel); save("recent"); inSug ? render() : redraw(); }
    else if (d.sclear !== undefined) { S.recent = []; save("recent"); inSug ? render() : redraw(); }
    else if (d.sclr !== undefined) clear();
    else if (d.sfill !== undefined) { const i = $("#q"); i.value = d.sfill + " "; syncHas(); i.focus(); render(); }
    else if (d.sq !== undefined) run(d.sq);
    else if (d.sf) { V.filter = d.sf; redraw(); }
    else if (d.sretry !== undefined) run(V.q, true);
  });
  syncHas();
}
