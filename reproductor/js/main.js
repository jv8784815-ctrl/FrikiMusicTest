import "./i18n.js";
import { icon, oicon, brandMark } from "./icons.js";
import { bridge } from "./bridge.js";
import { X } from "./ext.js";
import { parseHome, isNative } from "./native.js";
import { fetchTop } from "./stats.js";
import { S, save, applyTheme, toggleLike, isLiked, pushRecent, topArtist, artistNames } from "./store.js";
import { P, au, playList, playAt, toggle, next, prev, updateSession } from "./player.js";
import { fetchCountryChart, fetchHomeFeed, fetchArtistPage, fetchPlaylistPage, fetchAlbumPage, fetchAlbumTracks, fetchArtistAvatar } from "./yt.js";
import { V, lists, home, search, artist, album, queue, likes, settings, topGlobal, topCountry, countryName } from "./views.js";
import { wavy } from "./wavy.js";
import { ambient, coverColor } from "./ambient.js";
import { pic, bindCoverFallback } from "./img.js";
import { transport, fmt, toggleFull, closeFull, updateFull, isFullOpen, openFull } from "./full.js";
import { bindSettings } from "./settings.js";
import { toggleMini, bindMini, setAutoMini, miniSupported } from "./mini.js";
import { winButton } from "./download.js";
import { searchBarHTML, bindSearch, setBusy, closeSug } from "./search.js";
const $ = s => document.querySelector(s), esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const routes = { home, search, artist, album, queue, likes, settings, top: topGlobal, toppais: topCountry };
const topPages = { top: "ALL", toppais: "country" };
const nav = [["home", "Inicio"], ["search", "Buscar"], ["queue", "Cola"], ["likes", "Me gusta"], ["settings", "Ajustes"], ["top", "Top FrikiMusic"], ["toppais", "Top de tu país"]];
const icons = { home: "home", search: "search", queue: "queue", likes: "heart", settings: "settings", top: "trophy", toppais: "globe" };
const cur = () => (location.hash.slice(2).split("?")[0] || "home");
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 4500); }

const groups = [[null, ["search", "home"]], ["Descubrir", ["top", "toppais"]], ["Biblioteca", ["queue", "likes"]]], names = Object.fromEntries(nav);
const label = k => k === "toppais" ? (V.top.country ? "Top de " + countryName(V.top.country) : names[k]) : names[k];
function drawRail() {
  const r = $("#rail"), open = S.rail; r.classList.toggle("open", open);
  const item = k => `<a class="item${cur() === k ? " on" : ""}" href="#/${k}" title="${esc(label(k))}">${oicon(icons[k])}${open ? `<span>${esc(label(k))}</span>` : ""}</a>`;
  const brand = open
    ? `<div class="brand">${brandMark(30)}<span>FrikiMusic</span><button class="rbtn" data-rail aria-label="Contraer menú" title="Contraer menú">${oicon("left", 18)}</button></div>`
    : `<div class="brand"><button class="rbtn logo" data-rail aria-label="Expandir menú" title="Expandir menú">${brandMark(30)}</button></div>`;
  const win = winButton("rail-dl");
  r.innerHTML = brand
    + groups.map(([g, ks]) => (g && open ? `<div class="grp">${g}</div>` : g ? `<hr class="grp">` : "") + ks.map(item).join("")).join("")
    + `<div class="spacer"></div>${win}<div class="rfoot"><a class="rbtn${cur() === "settings" ? " on" : ""}" href="#/settings" aria-label="Ajustes" title="Ajustes">${oicon("settings", 18)}</a></div>`;
}
function drawTop() { $("#searchForm").innerHTML = searchBarHTML(V.q); }
function drawView() {
  const k = routes[cur()] ? cur() : "home"; $("#view").innerHTML = routes[k](); drawRail();
  if (k === "artist") {
    const image = $("#view .artist-photo img");
    if (image) image.onerror = () => { if (image.dataset.o && image.src !== image.dataset.o) image.src = image.dataset.o; else image.remove(); };
  }
  enhanceScrollers();
  applyDyn();
}
function enhanceScrollers() {
  document.querySelectorAll("#view .hs, #view .cols").forEach(el => {
    if (el.parentElement?.classList.contains("hsw")) return;
    const w = document.createElement("div"); w.className = "hsw";
    el.replaceWith(w); w.append(el);
    const mk = (cls, txt, dir) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "hsn " + cls; b.textContent = txt; b.setAttribute("aria-label", dir < 0 ? "Anterior" : "Siguiente");
      b.addEventListener("click", e => { e.stopPropagation(); el.scrollBy({ left: dir * el.clientWidth * .85, behavior: "smooth" }); });
      w.append(b); return b;
    };
    const prev = mk("prev", "‹", -1), next = mk("next", "›", 1);
    const upd = () => { prev.hidden = el.scrollLeft < 8; next.hidden = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8; };
    el.addEventListener("scroll", upd, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(upd).observe(el);
    upd();
  });
}
const tints = new Map();
let wantedTint = "";
const rootStyle = document.documentElement.style;
async function loadTint(url) {
  let c = tints.get(url);
  if (!c) { c = await coverColor(url); if (c) tints.set(url, c); }
  if (wantedTint !== url) return;
  if (c) rootStyle.setProperty("--dyn", c); else rootStyle.removeProperty("--dyn");
}
function applyDyn() {
  const k = cur();
  let url = "";
  if (k === "album") url = V.albumPage?.cover || V.albumTracks.find(t => t.cover)?.cover || "";
  else if (k === "artist") url = V.artistPage?.heroImage || "";
  if (!url) url = P.song?.cover || "";
  wantedTint = url;
  if (!url) return rootStyle.removeProperty("--dyn");
  if (tints.has(url)) rootStyle.setProperty("--dyn", tints.get(url)); else loadTint(url);
}
let albumToken = 0, albumFrom = "#/home";
async function openAlbum(id, type = "album") {
  if (!id) return;
  if (cur() !== "album") albumFrom = location.hash || "#/home";
  V.albumId = id; V.albumPage = null; V.albumTracks = []; V.albumErr = ""; V.albumLoading = true;
  if (location.hash !== "#/album") location.hash = "#/album";
  drawView();
  const token = ++albumToken;
  try {
    const page = await (type === "playlist" ? fetchPlaylistPage(id) : fetchAlbumPage(id));
    if (token !== albumToken) return;
    V.albumPage = page; V.albumTracks = page.tracks || [];
  } catch (e) { if (token === albumToken) V.albumErr = e.message || "No se pudo cargar el álbum."; }
  if (token === albumToken) { V.albumLoading = false; if (cur() === "album") drawView(); }
}
function albumShuffle() {
  const list = [...V.albumTracks]; if (!list.length) return;
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  playList(list, 0);
}
function albumAdd() {
  const list = V.albumTracks; if (!list.length) return;
  if (!P.queue.length || P.idx < 0) { playList(list, 0); return; }
  P.queue.push(...list); drawBar(); toast(`${list.length} canciones añadidas a la cola`);
}
async function playRelease(id) {
  try { const tracks = await fetchAlbumTracks(id); if (tracks.length) playList(tracks, 0); else toast("Este lanzamiento no tiene canciones disponibles."); }
  catch (e) { toast(e.message || "No se pudo cargar el lanzamiento."); }
}
let artistToken = 0, artistFrom = "#/home";
async function openArtist(name, browseId = "") {
  name = String(name || "").trim(); if (!name) return;
  if (cur() !== "artist") artistFrom = location.hash || "#/home";
  V.artist = name; V.artistId = browseId; V.artistPage = null; V.artistSongs = []; V.artistShelfTracks = {}; V.artistErr = ""; V.artistLoading = true;
  if (location.hash !== "#/artist") location.hash = "#/artist";
  drawView();
  const token = ++artistToken;
  try {
    const page = await fetchArtistPage(browseId || name);
    if (token !== artistToken) return;
    V.artistPage = page; V.artistId = page.id; V.artist = page.name; V.artistSongs = page.topSongs || [];
  } catch (e) {
    if (token !== artistToken) return;
    try {
      const found = await bridge("search", { query: name });
      if (token !== artistToken) return;
      V.artistSongs = (found || []).slice(0, 20);
      V.artistPage = { name, heroImage: "", audience: "", description: "", shelves: [] };
      fetchArtistAvatar(name).then(url => { if (url && token === artistToken && V.artistPage) { V.artistPage.heroImage = url; if (cur() === "artist") drawView(); } });
      if (!V.artistSongs.length) V.artistErr = e.message;
    } catch (fallback) { if (token === artistToken) V.artistErr = fallback.message || e.message; }
  }
  if (token === artistToken) { V.artistLoading = false; drawView(); }
}

let stopWavy = [];
function drawBar() {
  applyDyn();
  const s = P.song; if (s) { ambient(s.cover); updateSession(); }
  $("#bar").innerHTML = `<div class="meta" data-act="full">${s ? pic(s.cover, 192) : `<div class="ph"></div>`}<div><b>${s ? esc(s.title) : "Nada sonando"}</b><span class="muted">${s ? (P.loading ? "Cargando…" : esc(s.artist)) : "Busca una canción para empezar"}</span></div>
    ${s ? `<button class="ibtn${isLiked(s.id) ? " on" : ""}" data-like="${s.id}" aria-label="Me gusta">${icon("heart")}</button>` : ""}</div>`
    + transport() + `<div class="vol">${miniSupported() ? `<button class="ibtn" data-act="mini" aria-label="Mini reproductor" title="Mini reproductor (P)">${icon("pip", 20)}</button>` : ""}${icon("vol")}<input type="range" min="0" max="100" value="${au.volume * 100}" id="vol" aria-label="Volumen"></div>`;
  if (s) bindCoverFallback($("#bar .meta img"), s.id, s.cover);
  stopWavy.forEach(f => f()); stopWavy = [...document.querySelectorAll("#bar [data-wavy]")].map(wavy);
  updateFull();
}
au.addEventListener("timeupdate", () => document.querySelectorAll("[data-cur]").forEach(e => e.textContent = fmt(au.currentTime)));
au.addEventListener("loadedmetadata", () => document.querySelectorAll("[data-dur]").forEach(e => e.textContent = fmt(au.duration)));
let lastErr = ""; P.on(() => { drawBar(); if (cur() === "queue" || cur() === "home" || cur() === "artist" || cur() === "album" || topPages[cur()]) drawView(); if (P.error && P.error !== lastErr) toast(P.error); lastErr = P.error; });

const cache = new Map(); let tok = 0;
async function runSearch(q, force) {
  q = String(q).trim(); if (!q) return;
  const mine = ++tok, key = q.toLowerCase(), hit = !force && cache.get(key);
  pushRecent(q); $("#q").value = q; $("#searchForm").classList.add("has");
  if (matchMedia("(hover:none)").matches) $("#q").blur();
  closeSug();
  V.q = q; V.filter = "all"; V.err = ""; location.hash = "#/search";
  if (hit && Date.now() - hit.t < 6e5) { V.results = hit.r; V.loading = false; setBusy(false); return drawView(); }
  V.loading = true; setBusy(true); drawView();
  try { const r = await bridge("search", { query: q }); if (mine !== tok) return; V.results = r; V.ext = true; X.ok = true; cache.set(key, { r, t: Date.now() }); if (cache.size > 30) cache.delete(cache.keys().next().value); }
  catch (e) { if (mine !== tok) return; V.results = []; V.err = e.message; V.ext = !/extensi/i.test(e.message); if (!V.ext) X.ok = false; }
  V.loading = false; setBusy(false); drawView();
}
$("#searchForm").addEventListener("submit", e => { e.preventDefault(); const q = $("#q").value.trim(); if (q) runSearch(q); });
addEventListener("hashchange", () => { drawView(); ensureTop(); });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-artist],[data-release],[data-playlist],[data-top],[data-tp],[data-play],[data-like],[data-act],button[data-accent],[data-rail],[data-focus]"); if (!t) return;
  const d = t.dataset;
  if (d.artist !== undefined) { e.stopPropagation(); openArtist(d.artist, d.artistId || ""); }
  else if (d.release !== undefined) { e.stopPropagation(); openAlbum(d.release); }
  else if (d.top) { const [k, v] = d.top.split(":"); V.top[k] = v; V.top.data = null; loadTop(); drawView(); }
  else if (d.tp) { const T = V.tops[topPages[cur()]]; if (T) { T.period = d.tp; T.data = null; loadTopPage(cur()); } }
  else if (d.playlist !== undefined) { e.stopPropagation(); openAlbum(d.playlist, "playlist"); }
  else if (d.like !== undefined) { e.stopPropagation(); const s = [...V.results, ...P.queue, ...S.likes, ...S.history].find(x => x.id === d.like); s && toggleLike(s); drawView(); drawBar(); }
  else if (d.play) {
    const [l, i] = d.play.split(":"), list = lists()[l], track = list?.[+i];
    const playback = l === "queue" ? playAt(+i) : playList(list || [], +i);
    if (track?.video) Promise.resolve(playback).then(() => P.media?.videoLookup).then(() => {
      if (P.song !== track) return;
      if (P.media?.video) { if (!isFullOpen()) openFull(); }
      else toast("YouTube no ofrece un video reproducible para este resultado.");
    });
  }
  else if (d.act === "toggle") toggle(); else if (d.act === "next") next(); else if (d.act === "prev") prev();
  else if (d.act === "full") { if (P.song) toggleFull(); }
  else if (d.act === "mini") { if (t.closest("#full")) closeFull(); toggleMini(); }
  else if (d.act === "back") { location.hash = artistFrom; }
  else if (d.act === "album-back") { location.hash = albumFrom; }
  else if (d.act === "album-shuffle") albumShuffle();
  else if (d.act === "album-add") albumAdd();
  else if (d.accent) { S.accent = d.accent; save("accent"); applyTheme(); drawView(); }
  else if (d.rail !== undefined) { S.rail = !S.rail; save("rail"); drawRail(); }
  else if (d.focus) $("#q").focus();
});
document.addEventListener("input", e => { if (e.target.id === "vol") { au.volume = e.target.value / 100; S.cfg.volume = au.volume; save("cfg"); } });
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.tagName === "DIV" && (e.target.dataset?.play || e.target.dataset?.playlist || e.target.dataset?.release || e.target.dataset?.artist)) e.target.click();
  if (e.key === "Escape") closeFull();
  if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) toggleMini();
  if (e.code === "Space" && !/INPUT|BUTTON|SELECT|A/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
});
bindSettings({ redraw: drawView, rail: drawRail, toast });
bindMini({ toast, onLike: () => { drawView(); drawBar(); } }); setAutoMini();
bindSearch({ run: runSearch, redraw: drawView });
applyTheme(); drawTop(); drawRail(); drawView(); drawBar();
bridge("ping").then(() => { V.ext = true; X.ok = true; if (cur() === "settings") drawView(); }).catch(() => { V.ext = false; X.ok = false; drawView(); });
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(Error("Tiempo agotado")), ms))]);
async function loadHome() {
  const tries = [
    () => isNative ? Promise.reject(Error("sin sesión en la app")) : within(fetchHomeFeed(), 20000),
    async () => parseHome(await bridge("homeRaw")),
    () => bridge("home"),
  ];
  for (const attempt of tries) {
    try { const h = await attempt(); if (h?.length) { V.home = h; V.homeErr = ""; break; } }
    catch (e) { V.homeErr = e.message; }
  }
  if (cur() === "home") drawView();
}
async function loadTopArtist() {
  const name = topArtist();
  if (!name) return;
  const same = x => artistNames(x.artist).some(n => n.toLowerCase() === name.toLowerCase());
  const collab = x => same(x) && artistNames(x.artist).length > 1;
  const uniq = list => { const seen = new Set(); return list.filter(x => x?.id && !seen.has(x.id) && seen.add(x.id)); };
  let page = null, found = [];
  try { page = await fetchArtistPage(name); } catch {}
  try { found = await bridge("search", { query: name }); } catch {}
  let extra = [];
  try { extra = await bridge("search", { query: name + " feat" }); } catch {}
  const songs = uniq(page?.topSongs?.length ? page.topSongs : found.filter(same)).slice(0, 15).map(x => ({ ...x, kind: "track" }));
  const collabs = uniq([...S.history, ...S.likes, ...extra, ...found, ...(page?.topSongs || [])].filter(collab)).slice(0, 15).map(x => ({ ...x, kind: "track" }));
  V.topArtist = { name: page?.name || name, id: page?.id || "", heroImage: page?.heroImage || "", songs, collabs };
  if (cur() === "home") drawView();
}
const topCache = new Map();
async function loadTop() {
  const T = V.top, key = T.period + T.scope, hit = topCache.get(key);
  if (hit && Date.now() - hit.t < 12e4) { T.data = hit.d; T.country = hit.d.country || T.country; T.ok = true; T.loading = false; if (cur() === "home") drawView(); return; }
  T.loading = true;
  try { const d = await fetchTop(T.period, T.scope); if (T.period + T.scope !== key) return; topCache.set(key, { d, t: Date.now() }); T.data = d; T.country = d.country || T.country; T.ok = true; }
  catch { if (T.period + T.scope === key && T.ok) T.data = { items: [] }; }
  if (T.period + T.scope === key) T.loading = false;
  drawRail();
  if (cur() === "home") drawView();
}
async function loadTopPage(k) {
  const scope = topPages[k], T = V.tops[scope], key = T.period + scope, hit = topCache.get(key);
  if (hit && Date.now() - hit.t < 12e4) {
    T.data = hit.d; T.err = ""; T.loading = false;
    if (hit.d.country && hit.d.country !== V.top.country) { V.top.country = hit.d.country; drawRail(); }
    if (cur() === k) drawView();
    return;
  }
  T.loading = true; T.err = "";
  if (cur() === k) drawView();
  try {
    let d = await fetchTop(T.period, scope);
    if (scope === "country" && d.country) d = { ...d, items: await fetchCountryChart(d.country), source: "yt" };
    topCache.set(key, { d, t: Date.now() });
    if (T.period + scope === key) { T.data = d; if (d.country && d.country !== V.top.country) { V.top.country = d.country; drawRail(); } }
  } catch (e) { console.error("[FrikiMusic] top", e); if (T.period + scope === key) { T.data = null; T.err = "No se pudo cargar el Top" + (scope === "country" && e?.message ? " (" + e.message + ")" : "") + ". Inténtalo de nuevo en un momento."; } }
  if (T.period + scope === key) T.loading = false;
  if (cur() === k) drawView();
}
function ensureTop() { const k = cur(); if (topPages[k]) loadTopPage(k); }
loadHome();
loadTopArtist();
loadTop();
ensureTop();
let drag = null, dragged = false;
$("#view").addEventListener("pointerdown", e => {
  const el = e.target.closest(".hs");
  if (!el || e.pointerType !== "mouse" || e.button) return;
  drag = { el, x: e.clientX, s: el.scrollLeft, moved: false };
});
addEventListener("pointermove", e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; drag.el.classList.add("drag"); }
  if (drag.moved) drag.el.scrollLeft = drag.s - dx;
});
addEventListener("pointerup", () => {
  if (!drag) return;
  drag.el.classList.remove("drag");
  if (drag.moved) { dragged = true; setTimeout(() => { dragged = false; }, 0); }
  drag = null;
});
$("#view").addEventListener("click", e => { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
$("#view").addEventListener("dragstart", e => { if (e.target.closest(".hs")) e.preventDefault(); });
