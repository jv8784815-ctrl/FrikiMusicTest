import { icon } from "./icons.js";
import { S, isLiked } from "./store.js";
import { P, au } from "./player.js";
import { pic, hqPx } from "./img.js";
import { winButton } from "./download.js";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const V = { top: { period: "week", scope: "ALL", data: null, loading: false, ok: false, country: "" }, topArtist: null, q: "", results: [], feed: [], home: [], loading: false, ext: null, filter: "all", err: "", artist: "", artistId: "", artistPage: null, artistSongs: [], artistShelfTracks: {}, artistLoading: false, artistErr: "", albumId: "", albumPage: null, albumTracks: [], albumLoading: false, albumErr: "" };
// Resultados visibles según el filtro activo (Todo / Canciones / Vídeos). Los índices data-play="search:i" apuntan a esta lista.
export const shown = () => V.filter === "video" ? V.results.filter(s => s.video) : V.filter === "song" ? V.results.filter(s => !s.video) : V.results;
const hl = (t, q) => {
  const w = [...new Set(String(q || "").split(/\s+/).filter(x => x.length > 1))].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!w.length) return esc(t);
  return String(t ?? "").split(new RegExp(`(${w.join("|")})`, "gi")).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join("");
};
export const isTrack = x => !x.kind || x.kind === "track";
const TITLES = { "From the community": "De la comunidad", "Music videos for you": "Videoclips para ti", "Quick picks": "Selecciones rápidas", "Listen again": "Volver a escuchar", "Albums for you": "Álbumes para ti", "Mixed for you": "Mixes para ti", "Forgotten favorites": "Favoritos olvidados", "Similar to": "Similar a", "Recommended albums": "Álbumes recomendados", "Featured playlists": "Listas destacadas", "Trending community playlists": "Listas de la comunidad en tendencia", "New releases": "Novedades", "Charts": "Listas de éxitos" };
const secTitle = t => TITLES[t] || t;
const vb = s => s.video ? `<i class="vbadge">Vídeo</i>` : "";
const eq = `<span class="eq"><i></i><i></i><i></i></span>`;
// Mixes automáticos: canciones de tus recientes y favoritos agrupadas por artista (mínimo 2 canciones)
export function mixes() {
  const seen = new Set(), by = new Map();
  for (const s of [...S.history, ...S.likes]) { if (seen.has(s.id) || !s.artist) continue; seen.add(s.id); (by.get(s.artist) ?? by.set(s.artist, []).get(s.artist)).push(s); }
  return [...by].filter(([, l]) => l.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([artist, songs]) => ({ artist, songs }));
}
export const lists = () => ({ search: shown(), artist: V.artistSongs, album: V.albumTracks, ...V.artistShelfTracks, queue: P.queue, likes: S.likes, history: S.history, feed: V.feed, ...Object.fromEntries(V.home.map((h, i) => ["h" + i, h.items.filter(isTrack)])), top: (V.top.data?.items || []).map(x => ({ id: x.id, title: x.title, artist: x.artist, cover: x.cover, meta: "", video: false })), ta: V.topArtist?.songs || [], tc: V.topArtist?.collabs || [], ...Object.fromEntries(mixes().map((m, i) => ["m" + i, m.songs])) });
const artistLink = (a, id) => `<button class="artist-link" data-artist="${esc(a)}" data-artist-id="${esc(id || "")}">${esc(a)}</button>`;
const row = (s, l, i, q) => `<div class="row${P.song?.id === s.id ? " now" : ""}" tabindex="0" data-play="${l}:${i}">
  ${pic(s.cover, 168, 'loading="lazy"')}<div><b>${P.song?.id === s.id && !au.paused ? eq : ""}${hl(s.title, q)}${vb(s)}</b><span>${artistLink(s.artist, s.artistId)}</span></div>
  <span>${esc(s.meta)}</span><button class="ibtn${isLiked(s.id) ? " on" : ""}" data-like="${s.id}" aria-label="Me gusta">${icon("heart")}</button></div>`;
const card = (s, l, i) => `<div class="card${s.video ? " vcard" : ""}" tabindex="0" data-play="${l}:${i}"><div class="art">${pic(s.cover, 400, 'loading="lazy"')}<div class="pl">${icon("play")}</div>${vb(s)}</div><b>${esc(s.title)}</b><span>${artistLink(s.artist, s.artistId)}${s.meta ? " • " + esc(s.meta) : ""}</span></div>`;
const tile = (s, l, i) => `<div class="tile${P.song?.id === s.id ? " now" : ""}" tabindex="0" data-play="${l}:${i}">${pic(s.cover, 168, 'loading="lazy"')}<div><b>${esc(s.title)}</b><span>${artistLink(s.artist, s.artistId)}</span></div></div>`;
const mixCard = (m, i) => `<div class="mix" tabindex="0" data-play="m${i}:0"><div class="collage">${[0, 1, 2, 3].map(k => pic(m.songs[k % m.songs.length].cover, 300, 'loading="lazy"')).join("")}</div><div class="cap"><b>Mix de ${esc(m.artist)}</b><span>${m.songs.length} canciones</span></div><div class="pl">${icon("play")}</div></div>`;
const pcard = x => {
  const go = x.kind === "album" ? `data-release="${esc(x.id)}"` : x.kind === "artist" ? `data-artist="${esc(x.title)}" data-artist-id="${esc(x.id)}"` : `data-playlist="${esc(x.id)}"`;
  return `<div class="card pcard ${x.kind}" tabindex="0" ${go}><div class="art">${pic(x.cover, 400, 'loading="lazy"')}${x.kind === "artist" ? "" : `<div class="pl">${icon("play")}</div>`}</div><b>${esc(x.title)}</b><span>${esc(x.subtitle)}</span></div>`;
};
const secHead = sc => {
  const t = esc(secTitle(sc.title)), strap = sc.strap ? `<small class="strap">${esc(sc.strap)}</small>` : "";
  const inner = sc.link && sc.link.startsWith("UC") ? `<button class="sec-link" data-artist="${esc(sc.title)}" data-artist-id="${esc(sc.link)}">${t}<i class="chev">›</i></button>` : `${t}<i class="chev">›</i>`;
  return `<div class="sec"><div class="sech">${strap}<h2>${inner}</h2></div></div>`;
};
const PERIODS = [["day", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"]];
const countryName = c => { try { return new Intl.DisplayNames(["es"], { type: "region" }).of(c) || c; } catch { return c; } };
const topRow = (s, i) => `<div class="mini rank${P.song?.id === s.id ? " now" : ""}" tabindex="0" data-play="top:${i}"><i class="rk">${i + 1}</i>${pic(s.cover, 120, 'loading="lazy"')}<div><b>${esc(s.title)}</b><span>${esc(s.artist)} • ${s.plays} ${s.plays === 1 ? "reproducción" : "reproducciones"}</span></div></div>`;
const topBlock = () => {
  const T = V.top;
  if (!S.cfg.home.top || !T.ok) return "";
  const items = T.data?.items || [], cn = T.country ? countryName(T.country) : "";
  const chips = PERIODS.map(([k, l]) => `<button class="chip${T.period === k ? " on" : ""}" data-top="period:${k}" aria-pressed="${T.period === k}">${l}</button>`).join("")
    + `<span style="flex:1"></span><button class="chip${T.scope === "ALL" ? " on" : ""}" data-top="scope:ALL" aria-pressed="${T.scope === "ALL"}">Global</button>`
    + (cn ? `<button class="chip${T.scope === "country" ? " on" : ""}" data-top="scope:country" aria-pressed="${T.scope === "country"}">${esc(cn)}</button>` : "");
  const list = T.loading ? `<p class="muted">Cargando…</p>` : items.length ? `<div class="cols r3">${items.slice(0, 12).map(topRow).join("")}</div>` : `<p class="muted">Aún no hay suficientes reproducciones en este periodo.</p>`;
  const place = T.scope === "country" && cn ? "de " + esc(cn) : "global";
  return `<div class="sec"><div class="sech"><small class="strap">Lo más escuchado en FrikiMusic</small><h2>Top ${place}</h2></div></div><div class="top-chips">${chips}</div>${list}`;
};
const artistBlock = () => {
  const t = V.topArtist, H = S.cfg.home;
  if (!H.artist || !t || (!t.songs.length && !t.collabs.length)) return "";
  const shelf = (items, key) => `<div class="shelf ${items.filter(x => x.video).length > items.length / 2 ? "vid" : "xl"} hs">${items.map((s, i) => card(s, key, i)).join("")}</div>`;
  const head = `<div class="sec"><div class="sech ta-head">${t.heroImage ? `<span class="ta-av">${pic(t.heroImage, 56)}</span>` : ""}<div><small class="strap">Tu artista más escuchado</small><h2><button class="sec-link" data-artist="${esc(t.name)}" data-artist-id="${esc(t.id || "")}">${esc(t.name)}<i class="chev">›</i></button></h2></div></div></div>`;
  return head + (t.songs.length ? shelf(t.songs, "ta") : "") + (t.collabs.length ? `<div class="sec"><h2>Colaboraciones de ${esc(t.name)}</h2></div>` + shelf(t.collabs, "tc") : "");
};
const feedShelf = (sc, k) => {
  let ti = 0;
  const tracks = sc.items.filter(isTrack), vids = tracks.filter(x => x.video).length > sc.items.length / 2;
  const kind = sc.items.every(x => x.kind === "artist") ? "rnd" : vids ? "vid" : "xl";
  return secHead(sc) + `<div class="shelf ${kind} hs">${sc.items.map(x => isTrack(x) ? card(x, "h" + k, ti++) : pcard(x)).join("")}</div>`;
};
const mini = (s, l, i) => `<div class="mini${P.song?.id === s.id ? " now" : ""}" tabindex="0" data-play="${l}:${i}">${pic(s.cover, 120, 'loading="lazy"')}<div><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div></div>`;
const empty = (t, d, btn = "") => `<div class="empty"><h2>${t}</h2><p>${d}</p>${btn}</div>`;
const rows = (l, name, q) => l.map((s, i) => row(s, name, i, q)).join("");

const promo = () => { const b = winButton("lg"); return b ? `<div class="promo"><div><b>FrikiMusic para Windows</b><span>La app de escritorio, con instalador y sin extensión.</span></div>${b}</div>` : ""; };
export function home() {
  const h = S.history, H = S.cfg.home;
  if (!h.length && !V.home.length) return `<h1>Inicio</h1>` + promo() + topBlock() + empty("Tu música aparecerá aquí", "Tus reproducciones recientes y tus favoritos se guardan en este navegador.", `<button class="chip fill" data-focus="q">Explorar música</button>`)
    + (V.ext === false ? extNote() : "");
  const sec = t => `<div class="sec"><h2>${t}<i class="chev">›</i></h2></div>`;
  const body = (H.recent && h.length ? sec("Reproducido recientemente") + `<div class="cols r3">${h.slice(0, 12).map((s, i) => mini(s, "history", i)).join("")}</div>` : "")
    + artistBlock()
    + topBlock()
    + (H.feed ? V.home.map(feedShelf).join("") : "")
    + (H.again && h.length ? sec("Volver a escuchar") + `<div class="shelf xl hs">${h.slice(0, 15).map((s, i) => card(s, "history", i)).join("")}</div>` : "")
    + (H.mixes && mixes().length ? sec("Tus mixes") + `<div class="shelf big hs">${mixes().map(mixCard).join("")}</div>` : "")
    + (H.likes && S.likes.length ? sec("Tus favoritos") + `<div class="shelf xl hs">${S.likes.slice(0, 15).map((s, i) => card(s, "likes", i)).join("")}</div>` : "");
  return `<h1 class="ht">Inicio</h1>` + promo() + (body || empty("Inicio vacío", "Has ocultado todas las secciones. Vuelve a activarlas en Ajustes → Inicio.", `<a class="chip fill" href="#/settings" style="text-decoration:none">Abrir ajustes</a>`));
}
const extNote = () => `<p class="muted" style="text-align:center">La extensión no responde: cárgala en chrome://extensions y recarga la página.</p>`;
// Atajos de género para la pantalla vacía: [texto del botón, consulta que se envía]. Edita esta lista a tu gusto.
const GENRES = [["Pop", "pop hits"], ["Rock", "rock clásico"], ["Reguetón", "reggaeton hits"], ["Hip hop", "hip hop hits"], ["Electrónica", "electronic music"], ["Lo-fi", "lofi beats"],
  ["Metal", "metal"], ["Indie", "indie"], ["K-pop", "k-pop"], ["Anime openings", "anime openings"], ["Videojuegos", "video game soundtrack"]];
const FILTERS = [["all", "Todo"], ["song", "Canciones"], ["video", "Vídeos"]];
const recentChip = r => `<span class="chip rc"><button data-sq="${esc(r)}">${icon("history", 18)}${esc(r)}</button><button class="x" data-sdel="${esc(r)}" aria-label="Quitar “${esc(r)}” de recientes">${icon("close", 16)}</button></span>`;
const start = () => `<h1>Buscar</h1>`
  + (S.recent.length ? `<div class="sec"><h2>Recientes</h2><button class="lnk" data-sclear>Borrar todo</button></div><div class="chips">${S.recent.map(recentChip).join("")}</div>` : "")
  + `<div class="sec"><h2>Explora por género</h2></div><div class="chips">${GENRES.map(([l, q]) => `<button class="chip" data-sq="${esc(q)}">${esc(l)}</button>`).join("")}</div>`
  + `<p class="muted tip">Consejo: pulsa <kbd>/</kbd> en cualquier momento para empezar a buscar.</p>`;
const best = s => `<div class="best${P.song?.id === s.id ? " now" : ""}" tabindex="0" data-play="search:0">${pic(s.cover, 264)}
  <div><span class="lbl">Mejor resultado</span><b>${hl(s.title, V.q)}${vb(s)}</b><span class="sub">${artistLink(s.artist, s.artistId)}${s.meta ? " • " + esc(s.meta) : ""}</span></div>
  <div class="acts"><button class="ibtn${isLiked(s.id) ? " on" : ""}" data-like="${s.id}" aria-label="Me gusta">${icon("heart")}</button><span class="bplay" aria-hidden="true">${icon("play")}</span></div></div>`;
export function search() {
  if (V.loading) return `<h1>Buscando “${esc(V.q)}”…</h1><div class="skrows" aria-hidden="true">${`<div class="skrow"><i></i><div><i></i><i></i></div></div>`.repeat(8)}</div>`;
  if (!V.q) return start();
  const head = `<h1>Resultados para “${esc(V.q)}”</h1>`;
  if (V.err) return head + empty("No se pudo completar la búsqueda", esc(V.err), `<button class="chip fill" data-sretry>Reintentar</button>`) + (V.ext === false ? extNote() : "");
  if (!V.results.length) return head + empty("Sin resultados", "Revisa la ortografía o prueba con el título de la canción o el nombre del artista.");
  const list = shown(), nv = V.results.filter(x => x.video).length, n = { all: V.results.length, song: V.results.length - nv, video: nv };
  const bar = `<div class="sbar" role="group" aria-label="Filtrar resultados">`
    + FILTERS.map(([f, l]) => `<button class="chip${V.filter === f ? " on" : ""}" data-sf="${f}" aria-pressed="${V.filter === f}"${n[f] ? "" : " disabled"}>${l}<small>${n[f]}</small></button>`).join("")
    + `<span class="grow"></span><button class="chip fill" data-play="search:0">${icon("play", 20)}Reproducir todo</button></div>`;
  return head + bar + best(list[0])
    + (list.length > 1 ? `<div class="sec"><h2>Más resultados</h2><span class="muted" aria-live="polite">${list.length} en total</span></div>` + `<div class="rlist">${list.slice(1).map((s, i) => row(s, "search", i + 1, V.q)).join("")}</div>` : "");
}
export function artist() {
  const name = esc(V.artist || "Artista"), songs = V.artistSongs;
  if (V.artistLoading) return `<button class="lnk back-link" data-act="back">‹ Volver</button><div class="artist-loading"><i></i><i></i><i></i></div><h1>Buscando a ${name}…</h1>`;
  if (V.artistErr) return `<button class="lnk back-link" data-act="back">‹ Volver</button><h1>${name}</h1>${empty("No se pudo cargar el perfil", esc(V.artistErr))}`;
  if (!songs.length && !V.artistPage?.shelves?.length) return `<button class="lnk back-link" data-act="back">‹ Volver</button><h1>${name}</h1>${empty("No encontramos canciones", "Prueba a abrir el perfil desde una canción o revisa la conexión con YouTube Music.")}`;
  // Solo la foto real del artista: nunca la portada de una canción (si no hay foto, se ve el degradado)
  const data = V.artistPage || {}, heroUrl = data.heroImage || "", hero = heroUrl ? `<img src="${esc(hqPx(heroUrl, 1200))}" data-o="${esc(heroUrl)}" alt="" decoding="async">` : "";
  V.artistShelfTracks = Object.fromEntries((data.shelves || []).map((shelf, shelfIndex) => [`artist-shelf-${shelfIndex}`, shelf.items.filter(item => item.kind === "video" || item.kind === "song").map(item => ({ id: item.id, title: item.title, artist: V.artist, artistId: V.artistId, meta: item.subtitle, cover: item.cover || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`, video: item.kind === "video" }))]));
  const releases = (data.shelves || []).map((shelf, shelfIndex) => { const playable = shelf.items.filter(item => item.kind === "video" || item.kind === "song"); return `<section class="artist-release-section"><div class="sec"><h2>${esc(shelf.title)}</h2></div><div class="artist-releases">${shelf.items.map(item => { const tag = ({ album: "ÁLBUM", artist: "ARTISTA", playlist: "LISTA", video: "VIDEO" })[item.kind] || ""; const trackIndex = playable.findIndex(track => track.id === item.id); const action = item.kind === "album" && item.id ? `data-release="${esc(item.id)}"` : trackIndex >= 0 ? `data-play="artist-shelf-${shelfIndex}:${trackIndex}"` : ""; const related = item.kind === "artist" && item.id ? `<button class="related-artist" data-artist="${esc(item.title)}" data-artist-id="${esc(item.id)}">Ver artista</button>` : ""; return `<article class="artist-release" ${action}><div class="release-art">${item.cover ? pic(item.cover, 220, 'loading="lazy"') : ""}${tag ? `<span>${tag}</span>` : ""}${action && item.kind !== "artist" ? `<i class="release-play" aria-hidden="true">${icon("play", 19)}</i>` : ""}</div><b>${esc(item.title)}</b><small>${esc(item.subtitle)}</small>${related}</article>`; }).join("")}</div></section>`; }).join("");
  return `<button class="lnk back-link" data-act="back">‹ Volver</button>
    <header class="artist-hero"><div class="artist-photo">${hero}</div><div class="artist-shade"></div><div class="artist-intro"><span class="artist-kicker">ARTISTA</span><h1>${esc(data.name || V.artist || "Artista")}</h1><div class="artist-facts">${data.audience ? `<span>${esc(data.audience)}</span>` : ""}<span>${songs.length} canciones</span></div>${songs.length ? `<button class="artist-play" data-play="artist:0">${icon("play", 18)} Reproducir</button>` : ""}</div></header>
    ${data.description ? `<section class="artist-bio"><span class="artist-kicker">ACERCA DE</span><p>${esc(data.description)}</p></section>` : ""}
    ${songs.length ? `<section class="artist-top"><div class="sec"><h2>Canciones populares</h2></div><div class="rlist">${songs.map((s, i) => row(s, "artist", i)).join("")}</div></section>` : ""}${releases}`;
}
const xb = `<i class="xbadge" title="Contenido explícito">E</i>`;
const albumRow = (t, i) => {
  const now = P.song?.id === t.id, playing = now && !au.paused;
  return `<div class="arow${now ? " now" : ""}" tabindex="0" data-play="album:${i}"><span class="n">${playing ? eq : i + 1}<i class="pp">${icon("play", 16)}</i></span><b>${esc(t.title)}${t.explicit ? xb : ""}${V.albumPage?.isPlaylist && t.artist ? `<small class="asub">${esc(t.artist)}</small>` : ""}</b><span class="d">${esc(t.dur || "")}</span></div>`;
};
const albumMeta = (data, n) => {
  const mins = Math.max(1, Math.round((data.seconds || 0) / 60));
  return [data.kind || "Álbum", data.year, `${n} ${n === 1 ? "canción" : "canciones"}`, data.seconds ? `${mins} minutos` : ""].filter(Boolean);
};
export function album() {
  const back = `<button class="lnk back-link" data-act="album-back">‹ Volver</button>`;
  if (V.albumLoading) return `${back}<div class="artist-loading"><i></i><i></i><i></i></div><h1>Cargando álbum…</h1>`;
  if (V.albumErr) return `${back}${empty("No se pudo abrir el álbum", esc(V.albumErr))}`;
  const data = V.albumPage;
  if (!data) return `${back}${empty("Álbum no disponible", "Vuelve al perfil del artista y prueba de nuevo.")}`;
  const cover = data.cover || V.albumTracks.find(track => track.cover)?.cover || "", n = V.albumTracks.length, meta = albumMeta(data, n);
  const buttons = n ? `<div class="aact"><button class="aic" data-act="album-shuffle" aria-label="Aleatorio" title="Aleatorio">${icon("shuffle", 20)}</button><button class="aplay" data-play="album:0">${icon("play", 18)}<span>Reproducir</span></button><button class="aic" data-act="album-add" aria-label="Añadir a la cola" title="Añadir a la cola">${icon("plus", 20)}</button></div>` : "";
  return `<div class="album-page" data-cover="${esc(cover)}">${back}
    <header class="album-hero"><div class="album-cover">${cover ? pic(cover, 270).replace('alt=""', `alt="Portada de ${esc(data.title)}"`) : ""}</div>
      <div class="album-copy"><h1>${esc(data.title)}${data.explicit ? xb : ""}</h1><div class="album-artist">${data.isPlaylist ? esc(data.artist) : artistLink(data.artist, data.artistId)}</div><p class="album-meta">${meta.map(esc).join(" • ")}</p>${buttons}</div></header>
    <section class="album-tracks">${V.albumTracks.map(albumRow).join("")}</section>
    <footer class="album-foot"><span>${esc(meta.slice(0, 2).join(" • "))}</span><span>${esc(meta.slice(2).join(" • "))}</span><span>${esc(data.artist)}</span>${data.description ? `<p>${esc(data.description)}</p>` : ""}</footer></div>`;
}
export const queueRows = () => rows(P.queue, "queue");
export const queue = () => `<h1>Cola</h1><div style="height:14px"></div>` + (P.queue.length ? rows(P.queue, "queue") : empty("La cola está vacía", "Reproduce una canción y el resto de la lista aparecerá aquí."));
export const likes = () => `<h1>Me gusta</h1><div style="height:14px"></div>` + (S.likes.length ? rows(S.likes, "likes") : empty("Aún no tienes favoritos", "Toca el corazón de una canción para guardarla."));
export { settings } from "./settings.js";
