// Botón "Descargar para Windows" del reproductor. Apunta a /api/windows (redirige siempre al .exe, nunca al APK)
// y, cuando /api/downloads responde, pasa al enlace directo y muestra versión y tamaño.
import { isNative } from "./native.js";
const W = { url: "/api/windows", meta: "Instalador .exe" };
export const showWinDownload = !isNative; // dentro de la app de Android no tiene sentido
const mb = b => b ? (b / 1048576 >= 100 ? (b / 1048576).toFixed(0) : (b / 1048576).toFixed(1)) + " MB" : "";
const apply = () => document.querySelectorAll("[data-win-dl]").forEach(a => {
  a.href = W.url;
  const m = a.querySelector(".wb-meta"); if (m) m.textContent = W.meta;
});
// Logo de Windows como máscara: se pinta con el degradado del acento
const LOGO = `<span class="wb-logo" aria-hidden="true"></span>`;
export const winButton = (cls = "") => showWinDownload
  ? `<a class="win-badge ${cls}" data-win-dl href="${W.url}" title="Descargar FrikiMusic para Windows" aria-label="Descargar FrikiMusic para Windows">`
    + `<span class="wb-rim" aria-hidden="true"></span>${LOGO}`
    + `<span class="wb-text"><span class="wb-cap">Descargar app</span><span class="wb-name">Windows</span></span>`
    + `<span class="wb-side"><span class="wb-meta">${W.meta}</span><span class="wb-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4v10.2l3.6-3.6L17 12l-5 5-5-5 1.4-1.4 3.6 3.6V4z"/><path d="M5 19h14v2H5z"/></svg></span></span></a>` : "";
if (showWinDownload) fetch("/api/downloads").then(r => r.ok ? r.json() : Promise.reject()).then(d => {
  const w = d?.windows; if (!w?.downloadUrl) return;
  W.url = w.downloadUrl;
  W.meta = [w.version && (/^v/i.test(w.version) ? w.version : "v" + w.version), mb(w.size)].filter(Boolean).join(" · ") || W.meta;
  apply();
}).catch(() => {});
export const refreshWinDownload = apply;
