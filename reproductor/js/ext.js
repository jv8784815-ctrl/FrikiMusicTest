

import { isNative } from "./native.js";
export const EXT_ZIP = "/FrikiMusic-Bridge.zip";
export const X = { ok: null };
export const needsExt = !isNative;

const edge = /Edg\//.test(navigator.userAgent);
const where = edge ? "edge://extensions" : "chrome://extensions";

const STEPS = [
  `Descarga el zip con el botón de arriba.`,
  `Descomprime el zip: te quedará la carpeta <b>FrikiMusic Bridge</b>. Déjala en un sitio fijo y no la borres (el navegador la lee desde ahí cada vez que se abre).`,
  `Abre <code>${where}</code> en una pestaña nueva.`,
  `Activa el <b>Modo de desarrollador</b> (esquina superior derecha${edge ? ", o el panel de la izquierda en Edge" : ""}).`,
  `Pulsa <b>Cargar descomprimida</b> y elige la carpeta <b>FrikiMusic Bridge</b> (la que tiene dentro <code>manifest.json</code>).`,
  `Vuelve aquí y pulsa <b>Comprobar de nuevo</b> (o recarga la página).`,
];

export const zipButton = (cls = "fill") => `<a class="chip ${cls}" href="${EXT_ZIP}" download style="text-decoration:none">Descargar extensión (.zip)</a>`;

export const extSteps = () => `<ol class="extsteps">${STEPS.map(s => `<li>${s}</li>`).join("")}</ol>`;

export function extSection() {
  if (!needsExt) return "";
  const st = X.ok === true ? `<span class="extst ok">Detectada ✓</span>` : X.ok === false ? `<span class="extst no">No detectada</span>` : `<span class="extst">Comprobando…</span>`;
  const head = `<div class="srow"><div><b>FrikiMusic Bridge</b><span class="d">Hace de puente para buscar música y cargar letras desde esta web. ${X.ok === true ? "Ya está funcionando." : "Sin ella la búsqueda no funciona."}</span></div>${st}</div>`;
  const btns = `<div class="sbtns">${zipButton(X.ok === true ? "" : "fill")}<button class="chip" data-do="extcheck">Comprobar de nuevo</button></div>`;
  const how = `<div class="srow col"><div><b>Cómo instalarla en ${edge ? "Edge" : "Chrome"}</b></div>${extSteps()}</div>`;
  return `<section class="ssec"><h2>Extensión</h2><div class="scard">${head}${btns}${X.ok === true ? "" : how}</div></section>`;
}

export const extBanner = () => needsExt && X.ok === false
  ? `<div class="promo"><div><b>Falta la extensión FrikiMusic Bridge</b><span>La necesitas para buscar y reproducir. Descárgala e instálala en un minuto.</span></div><a class="chip fill" href="#/settings" style="text-decoration:none">Descargar e instalar</a></div>`
  : "";
