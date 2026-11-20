
import { S, DEF, FONTS, save, mergeCfg, applyTheme } from "./store.js";
import { VS, setQuality, refresh as refreshVideo } from "./video.js";
import { AQ, setAudioQuality } from "./player.js";
import { setAutoMini, refreshMini } from "./mini.js";
import { extSection, X } from "./ext.js";
import { bridge } from "./bridge.js";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const get = k => k === "theme" || k === "accent" || k === "rail" ? S[k] : k === "vq" ? VS.quality : k === "aq" ? AQ.quality : k.split(".").reduce((o, p) => o?.[p], S.cfg);
function set(k, v) {
  if (k === "theme" || k === "accent" || k === "rail") { S[k] = v; save(k); }
  else if (k === "vq") setQuality(v);
  else if (k === "aq") setAudioQuality(v);
  else { const p = k.split("."); let o = S.cfg; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v; save("cfg"); }
}
const parse = v => /^-?\d+(\.\d+)?$/.test(v) ? +v : v;

const seg = (k, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button role="radio" aria-checked="${get(k) === v}" class="${get(k) === v ? "on" : ""}" data-set="${k}" data-val="${v}">${l}</button>`).join("")}</div>`;
const sw = k => `<button class="sw${get(k) ? " on" : ""}" role="switch" aria-checked="${!!get(k)}" aria-label="Activar o desactivar" data-set="${k}" data-toggle></button>`;
const rng = (k, min, max, step, unit) => `<div class="rng"><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${get(k)}"><output>${get(k)}${unit}</output></div>`;
const sel = (k, opts) => `<select class="ssel" data-set="${k}" aria-label="Elegir">${opts.map(([v, l]) => `<option value="${v}"${String(get(k)) === String(v) ? " selected" : ""}>${l}</option>`).join("")}</select>`;
const row = (t, d, ctl, cls = "") => `<div class="srow ${cls}"><div><b>${t}</b>${d ? `<span class="d">${d}</span>` : ""}</div>${ctl}</div>`;
const sec = (t, rows) => `<section class="ssec"><h2>${t}</h2><div class="scard">${rows}</div></section>`;

const PAL = { rose: "#FFB0D0", purple: "#D0BCFF", blue: "#9ECAFF", teal: "#53DBC9", green: "#A4D18A", amber: "#F1C24F", orange: "#FFB77C", red: "#FFB4AB", mono: "#C8C6CA" };
const NAMES = { rose: "Rosa", purple: "Violeta", blue: "Azul", teal: "Turquesa", green: "Verde", amber: "Ámbar", orange: "Naranja", red: "Rojo", mono: "Grafito" };
const pal = () => `<div class="pal">${Object.entries(PAL).map(([k, c]) => `<button data-accent="${k}" class="${S.accent === k ? "on" : ""}" aria-label="${NAMES[k]}" title="${NAMES[k]}" style="background:${c}"></button>`).join("")}
  <button data-accent="cover" class="dyn${S.accent === "cover" ? " on" : ""}" aria-label="Dinámico" title="Dinámico: toma el color de la portada"></button>
  <label class="cust${S.accent === "custom" ? " on" : ""}" title="Color personalizado" style="${S.accent === "custom" ? `background:${S.cfg.customColor}` : ""}"><input type="color" data-set="customColor" value="${S.cfg.customColor}" aria-label="Color personalizado"></label></div>`;

export function settings() {
  const fonts = Object.entries(FONTS).map(([k, [n]]) => [k, n]);
  return `<h1>Ajustes</h1>`
    + sec("Apariencia",
      row("Tema", "«Automático» sigue el modo claro/oscuro del sistema.", seg("theme", [["dark", "Oscuro"], ["light", "Claro"], ["auto", "Automático"]]))
      + row("Color de acento", "Elige uno, deja que lo ponga la portada (Dinámico) o crea el tuyo.", pal(), "col")
      + row("Tipografía", "", sel("font", fonts))
      + row("Tamaño del texto", "", rng("fs", 85, 130, 5, " %"))
      + row("Esquinas", "", seg("radius", [["sharp", "Rectas"], ["soft", "Suaves"], ["normal", "Normales"], ["round", "Redondas"]]))
      + row("Densidad", "Espacio entre filas y alto de la barra inferior.", seg("density", [["compact", "Compacta"], ["normal", "Normal"], ["airy", "Amplia"]]))
      + row("Animaciones", "Desactívalas para una interfaz más estática (también aplana la barra ondulada).", sw("motion")))
    + sec("Fondo",
      row("Color ambiental", "Un resplandor con los colores de la portada tras el contenido.", sw("ambient"))
      + row("Intensidad del resplandor", "", rng("ambInt", 5, 60, 1, " %"))
      + row("Fondo del reproductor grande", "", seg("fbg", [["mesh", "Malla"], ["blur", "Portada"], ["solid", "Liso"]]))
      + row("Mover el fondo", "Deriva lenta de la malla de color.", sw("fanim")))
    + sec("Barras y botones",
      row("Menú lateral expandido", "", sw("rail"))
      + row("Barra de progreso", "", seg("wave", [["wavy", "Ondulada"], ["flat", "Recta"]]))
      + row("Botón de reproducir", "", seg("playShape", [["squircle", "Redondeado"], ["circle", "Círculo"]])))
    + sec("Mini reproductor flotante",
      row("Diseño", "Liquid Glass es el nuevo; Clásico es el diseño anterior.", seg("miniDesign", [["glass", "Liquid Glass"], ["classic", "Clásico"], ["vinyl", "Vinilo"], ["poster", "Portada"], ["capsule", "Cápsula"]]))
      +       row("Cómo abrirlo", "Botón de la barra inferior o tecla P. Se queda encima de las demás ventanas. Necesita Chrome o Edge 116 o superior.", "")
      + row("Tamaño al abrir", "", seg("miniSize", [["small", "Pequeño"], ["medium", "Normal"], ["large", "Grande"]]))
      + row("Mostrar la línea de letra actual", "Solo con letras sincronizadas; en tamaño pequeño no se muestra.", sw("miniLyric"))
      + row("Abrir solo al cambiar de pestaña", "Experimental: depende de tu versión de Chrome.", sw("miniAuto")))
    + sec("Inicio",
      row("Tamaño de las tarjetas", "", seg("cardSize", [["small", "Pequeñas"], ["medium", "Medianas"], ["large", "Grandes"]]))
      + row("Reproducido recientemente", "", sw("home.recent"))
      + row("Recomendaciones de YouTube Music", "", sw("home.feed"))
      + row("Volver a escuchar", "", sw("home.again"))
      + row("Tus mixes", "", sw("home.mixes"))
      + row("Tu artista más escuchado", "Sus canciones y colaboraciones.", sw("home.artist"))
      + row("Top de FrikiMusic", "Lo más escuchado hoy, esta semana y este mes.", sw("home.top"))
      + row("Tus favoritos", "", sw("home.likes"))
      + row("Canciones en el historial", "", seg("histMax", [[15, "15"], [30, "30"], [60, "60"], [100, "100"]])))
    + sec("Reproductor completo y letras",
      row("Diseño del reproductor", "Elige una presentación: Escenario, Halo, Vinilo o Cristal.", seg("fdesign", [["classic", "Escenario"], ["halo", "Halo"], ["vinyl", "Vinilo"], ["glass", "Cristal"]]))
      + row("Panel al abrir", "", seg("fpanel", [["lyrics", "Letras"], ["queue", "Cola"], ["none", "Ninguno"]]))
      + row("Videoclip", "Muestra el vídeo cuando la canción lo tiene.", sw("video"))
      + row("Calidad de vídeo", "Se aplica a videoclips y a directos como Station. Si no existe esa resolución se usa la más cercana por debajo.", sel("vq", [["auto", "Auto"], [2160, "4K"], [1440, "2K"], [1080, "1080p"], [720, "720p"], [480, "480p"], [360, "360p"], [240, "240p"], [144, "144p"]]))
      + row("Calidad de audio", "Alta usa el mayor bitrate, Media ronda los 128 kbps y Baja el mínimo para ahorrar datos. También en el menú de calidad del reproductor.", sel("aq", [["auto", "Auto"], ["high", "Alta"], ["medium", "Media"], ["low", "Baja"]]))
      + row("Ocultar controles del vídeo", "Tras este tiempo sin mover el puntero.", seg("idle", [[2, "2 s"], [3, "3 s"], [5, "5 s"], [10, "10 s"], [0, "Nunca"]]))
      + row("Tamaño de la letra", "", rng("lySize", 70, 150, 5, " %"))
      + row("Alineación de la letra", "", seg("lyAlign", [["left", "Izquierda"], ["center", "Centro"]]))
      + row("Barrido palabra a palabra", "Solo con letras sincronizadas palabra a palabra; las de por líneas nunca barren. Si lo apagas, la línea activa se ilumina entera.", sw("sweep"))
      + row("Difuminar líneas inactivas", "", sw("lyBlur")))
    + sec("Reproducción", row("Pasar a la siguiente canción al terminar", "El volumen se recuerda siempre.", sw("autonext")) + row("Contar mis reproducciones en el Top", "Anónimo: solo la canción y tu país, sin cuenta ni datos personales.", sw("stats")))
    + extSection()
    + `<section class="ssec"><h2>Datos</h2><div class="scard"><div class="sbtns">
        <button class="chip" data-do="export">Exportar copia</button><button class="chip" data-do="import">Importar copia</button>
        <button class="chip" data-do="reset">Restablecer ajustes</button><button class="chip danger" data-do="clearhist">Borrar historial</button><button class="chip danger" data-do="clearlikes">Borrar favoritos</button></div>
        <div class="srow"><div><span class="d">La copia incluye ajustes, favoritos e historial. Útil para llevarlo de localhost a tu dominio de Vercel (cada dirección guarda sus propios datos).</span></div></div></div>
        <input type="file" id="impFile" accept=".json,application/json" hidden></section>`;
}

export function bindSettings({ redraw, rail, toast }) {
  const apply = k => { applyTheme(); if (k === "video") refreshVideo(); if (k === "rail") rail(); if (k === "miniAuto") setAutoMini(); if (k.startsWith("mini")) refreshMini(); };
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-set]");
    if (b) { const k = b.dataset.set; set(k, b.hasAttribute("data-toggle") ? !get(k) : parse(b.dataset.val)); apply(k); redraw(); return; }

    const c = e.target.closest(".cust");
    if (c && S.accent !== "custom") { set("accent", "custom"); applyTheme(); c.parentElement.querySelectorAll(".on").forEach(x => x.classList.remove("on")); c.classList.add("on"); c.style.background = S.cfg.customColor; }
    const d = e.target.closest("[data-do]"); if (d) action(d.dataset.do);
  });
  document.addEventListener("input", e => {
    const t = e.target; if (!t.dataset?.set) return;
    if (t.type === "range") { set(t.dataset.set, +t.value); t.nextElementSibling.textContent = t.value + (t.nextElementSibling.textContent.replace(/[\d.-]+/, "")); apply(t.dataset.set); }
    else if (t.type === "color") { set("customColor", t.value); if (S.accent !== "custom") set("accent", "custom"); applyTheme(); t.parentElement.style.background = t.value; }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.tagName === "SELECT" && t.dataset?.set) { set(t.dataset.set, parse(t.value)); apply(t.dataset.set); redraw(); }
    else if (t.type === "color" && t.dataset?.set) redraw();
    else if (t.id === "impFile" && t.files[0]) importFile(t.files[0]);
  });

  function action(a) {
    if (a === "export") {
      const blob = new Blob([JSON.stringify({ app: "frikimusic", v: 1, theme: S.theme, accent: S.accent, rail: S.rail, cfg: S.cfg, likes: S.likes, history: S.history }, null, 2)], { type: "application/json" });
      const l = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "frikimusic-copia.json" }); l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000);
    } else if (a === "import") document.getElementById("impFile").click();
    else if (a === "reset") { if (!confirm("¿Restablecer todos los ajustes a sus valores originales? Tus favoritos no se tocan.")) return;
      ["cfg", "accent", "theme", "rail", "vq", "aq"].forEach(k => localStorage.removeItem("fm." + k));
      S.cfg = mergeCfg({}); S.accent = "rose"; S.theme = "dark"; S.rail = true; setQuality("auto"); setAudioQuality("auto"); apply("rail"); redraw(); toast("Ajustes restablecidos"); }
    else if (a === "extcheck") { X.ok = null; redraw(); bridge("ping").then(() => { X.ok = true; toast("Extensión detectada"); }).catch(() => { X.ok = false; toast("Sigue sin responder: revisa los pasos y recarga la página"); }).finally(redraw); }
    else if (a === "clearhist") { if (!confirm("¿Borrar el historial de reproducción?")) return; S.history = []; save("history"); redraw(); toast("Historial borrado"); }
    else if (a === "clearlikes") { if (!confirm("¿Borrar todos tus favoritos?")) return; S.likes = []; save("likes"); redraw(); toast("Favoritos borrados"); }
  }
  async function importFile(f) {
    try {
      const j = JSON.parse(await f.text()); if (j.app !== "frikimusic") throw 0;
      if (["dark", "light", "auto"].includes(j.theme)) S.theme = j.theme;
      if (typeof j.accent === "string") S.accent = j.accent;
      if (typeof j.rail === "boolean") S.rail = j.rail;
      S.cfg = mergeCfg(j.cfg);
      const merge = (mine, theirs) => { const ids = new Set(mine.map(s => s.id)); return [...mine, ...(Array.isArray(theirs) ? theirs : []).filter(s => s?.id && !ids.has(s.id))]; };
      S.likes = merge(S.likes, j.likes); S.history = merge(S.history, j.history).slice(0, S.cfg.histMax);
      ["theme", "accent", "rail", "cfg", "likes", "history"].forEach(save);
      apply("rail"); redraw(); toast("Copia importada");
    } catch { toast("Ese archivo no es una copia de FrikiMusic"); }
    document.getElementById("impFile").value = "";
  }
}
