
import { isNative } from "./native.js";
export const EXT_ZIP = "/FrikiMusic-Bridge.zip";
// Versión del zip que se publica. Súbela cuando cambies la extensión: quien tenga una anterior verá «Actualización disponible».
export const EXT_LATEST = "0.3.6";
export const X = { ok: null, v: "", open: undefined };
export const needsExt = !isNative;

const edge = /Edg\//.test(navigator.userAgent);
export const extWhere = edge ? "edge://extensions" : "chrome://extensions";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  puzzle: svg(`<path d="M10 4.5a1.8 1.8 0 1 1 3.6 0V6h3.4A1.5 1.5 0 0 1 18.5 7.5V11h1.5a1.8 1.8 0 1 1 0 3.6h-1.5v3.4a1.5 1.5 0 0 1-1.5 1.5h-3.4v-1.5a1.8 1.8 0 1 0-3.6 0v1.5H7A1.5 1.5 0 0 1 5.5 18v-3.4H7a1.8 1.8 0 1 0 0-3.6H5.5V7.5A1.5 1.5 0 0 1 7 6h3z"/>`),
  chev: svg(`<path d="M6 9l6 6 6-6"/>`),
  copy: svg(`<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>`),
  dl: svg(`<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>`),
  retry: svg(`<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>`),
};

// Los textos de los pasos se mantienen tal cual para conservar sus traducciones.
const STEPS = [
  `Descarga el zip con el botón de arriba.`,
  `Descomprime el zip: te quedará la carpeta <b>FrikiMusic Bridge</b>. Déjala en un sitio fijo y no la borres (el navegador la lee desde ahí cada vez que se abre).`,
  `Abre <code>${extWhere}</code> <button type="button" class="extcopy" data-do="extcopy" title="Copiar dirección" aria-label="Copiar dirección">${IC.copy}</button> en una pestaña nueva.`,
  `Activa el <b>Modo de desarrollador</b> (esquina superior derecha${edge ? ", o el panel de la izquierda en Edge" : ""}).`,
  `Pulsa <b>Cargar descomprimida</b> y elige la carpeta <b>FrikiMusic Bridge</b> (la que tiene dentro <code>manifest.json</code>).`,
  `Vuelve aquí y pulsa <b>Comprobar de nuevo</b> (o recarga la página).`,
];

export const zipButton = (cls = "fill", label = "Descargar extensión (.zip)") => `<a class="chip ${cls}" href="${EXT_ZIP}" download style="text-decoration:none">${IC.dl}${label}</a>`;

export const extSteps = () => `<ol class="extsteps">${STEPS.map(s => `<li>${s}</li>`).join("")}</ol>`;

// ¿la versión a es anterior a la b? (formato 1.2.3)
const older = (a, b) => {
  const x = String(a).split(".").map(n => parseInt(n) || 0), y = String(b).split(".").map(n => parseInt(n) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
export const extState = () => X.ok === true ? (X.v && older(X.v, EXT_LATEST) ? "upd" : "ok") : X.ok === false ? "no" : "chk";
export const extIsOpen = () => X.open ?? (X.ok === false);

const PILL = { ok: "Conectada", upd: "Actualización disponible", no: "No detectada", chk: "Comprobando…" };

export function extSection() {
  if (!needsExt) return "";
  const s = extState(), open = extIsOpen();
  const base = "Hace de puente para buscar música y cargar letras desde esta web.";
  const desc = s === "ok" ? `${base} Ya está funcionando.` : s === "no" ? `${base} Sin ella la búsqueda no funciona.` : s === "upd" ? `${base} Hay una versión nueva disponible.` : base;
  const ver = X.v ? `<span class="extver" translate="no">v${esc(X.v)}</span>` : "";

  const head = `<button type="button" class="extrow" data-do="extopen" aria-expanded="${open}" aria-controls="extbody">
    <span class="exticon">${IC.puzzle}<i class="extdot"></i></span>
    <span class="extmeta"><b translate="no">FrikiMusic Bridge</b><span class="d">${desc}</span></span>
    <span class="extst ${s}"><i class="extdot"></i>${PILL[s]}</span>${ver}
    <span class="extchev">${IC.chev}</span></button>`;

  let body;
  if (s === "no") {
    body = `<div class="extacts">${zipButton("fill")}<button type="button" class="chip" data-do="extcheck">${IC.retry}Comprobar de nuevo</button></div>
      <h3 class="exthow">Cómo instalarla en ${edge ? "Edge" : "Chrome"}</h3>${extSteps()}`;
  } else {
    const kv = X.v ? `<dl class="extkv"><div><dt>Versión instalada</dt><dd translate="no">v${esc(X.v)}</dd></div><div><dt>Versión más reciente</dt><dd translate="no">v${EXT_LATEST}</dd></div></dl>` : "";
    const hint = s === "upd" ? `<p class="exthint">Descomprime el zip sobre la carpeta anterior, abre <code>${extWhere}</code> y pulsa el botón de recargar de FrikiMusic Bridge.</p>` : "";
    body = `${kv}${hint}<div class="extacts">${s === "upd" ? zipButton("fill", "Descargar actualización") : zipButton("")}<button type="button" class="chip" data-do="extcheck">${IC.retry}Comprobar de nuevo</button></div>`;
  }
  return `<section class="ssec extsec"><h2>Extensión</h2><div class="scard extcard ${s}${open ? " open" : ""}">${head}<div class="extbody" id="extbody"><div class="extin">${body}</div></div></div></section>`;
}

export const extBanner = () => needsExt && X.ok === false
  ? `<div class="promo"><div><b>Falta la extensión FrikiMusic Bridge</b><span>La necesitas para buscar y reproducir. Descárgala e instálala en un minuto.</span></div><a class="chip fill" href="#/settings" style="text-decoration:none">Descargar e instalar</a></div>`
  : "";
