// Resolución del audio como en BitChord (playback/youtube/innertube.ts y resolver.ts):
// YouTube.js en la propia página, cliente VISIONOS (URLs directas, sin PO token).
import { isNative, nfetch } from "./native.js";
import { bridge } from "./bridge.js";
import { Innertube, Platform, UniversalCache, Utils, YT } from "../vendor/youtubei.js";

const HOSTS = new Set(["music.youtube.com", "www.youtube.com", "youtube.com"]);
const SAFE = new Set(["accept", "accept-language", "content-language"]);

// youtubei rechaza el preflight CORS (400): se envía como petición "simple" (text/plain, sin cabeceras propias).
// La extensión añade Origin, Referer y X-Origin con declarativeNetRequest.
async function simpleFetch(input, init) {
  if (isNative) return nfetch(input, init);
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : input.toString());
  if (!HOSTS.has(url.hostname) || url.pathname.startsWith("/api/jnn/")) return fetch(input, init);
  const method = init?.method ?? req?.method ?? "GET";
  const headers = new Headers();
  new Headers(init?.headers ?? req?.headers).forEach((v, k) => SAFE.has(k.toLowerCase()) && headers.set(k, v));
  let body = init?.body;
  if (body === undefined && req && method !== "GET" && method !== "HEAD") body = await req.text();
  if (body != null) headers.set("Content-Type", "text/plain;charset=UTF-8");
  try {
    return await fetch(url, { method, headers, body: body ?? null, signal: init?.signal ?? req?.signal ?? null, credentials: "omit" });
  } catch (e) {
    throw new Error(`No se pudo conectar con ${url.host}${url.pathname} (${e.message}). Recarga la extensión y abre /web/debug.html`);
  }
}

let instance = null, signedInstance = null;
async function makeInnertube(fetchFn) {
  Platform.shim.eval = async (data, env) => {
    const props = [];
    if (env.n) props.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
    if (env.sig) props.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
    return new Function(`${data.output}\nreturn { ${props.join(", ")} }`)();
  };
  return Innertube.create({ cache: new UniversalCache(true), fetch: fetchFn, retrieve_player: true });
}
export function getInnertube() {
  instance ??= makeInnertube(simpleFetch).catch(e => { instance = null; try { indexedDB.deleteDatabase("youtubei.js"); } catch {} throw e; });
  return instance;
}

const isInnertubeCall = url => (url.hostname === "music.youtube.com" || url.hostname === "www.youtube.com") && url.pathname.startsWith("/youtubei/");
async function signedFetch(input, init) {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : input.toString());
  if (!isInnertubeCall(url)) return simpleFetch(input, init);
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
  const headers = {};
  new Headers(init?.headers ?? req?.headers).forEach((v, k) => { headers[k] = v; });
  let body = init?.body;
  if (body === undefined && req && method !== "GET") body = await req.text();
  if (body != null && typeof body !== "string") body = await new Response(body).text();
  const r = await bridge("ytfetch", { url: url.toString(), method, headers, ...(typeof body === "string" && { body }), auth: true });
  const payload = r.bodyEncoding === "base64" ? Uint8Array.from(atob(r.body), c => c.charCodeAt(0)) : r.body;
  return new Response([204, 304].includes(r.status) ? null : payload, { status: r.status, headers: r.headers });
}
export function getSignedInnertube() {
  signedInstance ??= makeInnertube(signedFetch).then(yt => { yt.session.logged_in = true; return yt; }, e => { signedInstance = null; throw e; });
  return signedInstance;
}

const txt = v => typeof v === "string" ? v.trim() : (v?.text ?? "").trim();
const largest = th => [...(th || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || "";
const thumbOf = n => { const t = n?.thumbnail; return largest(Array.isArray(t) ? t : t?.contents); };
const linkId = ep => ep?.payload?.browseId || "";
const kindOf = (type, id) => ({ song: "song", video: "video", album: "album", playlist: "playlist", artist: "artist", library_artist: "artist" })[type]
  || (id?.startsWith("MPREb_") ? "album" : /^(VL|PL)/.test(id || "") ? "playlist" : id?.startsWith("UC") ? "artist" : "");
function homeItem(node) {
  if (node?.type !== "MusicTwoRowItem" && node?.type !== "MusicResponsiveListItem") return null;
  const id = node.id || linkId(node.endpoint) || node.endpoint?.payload?.videoId || "";
  const kind = kindOf(node.item_type, id);
  if (!id || !kind) return null;
  const artists = (node.artists ?? node.authors ?? (node.author ? [node.author] : [])).filter(a => a?.name);
  const names = artists.map(a => a.name).join(", ");
  const sub = txt(node.subtitle);
  const title = (kind === "artist" ? txt(node.name) : "") || txt(node.title) || txt(node.name);
  const cover = thumbOf(node);
  if (kind === "song" || kind === "video") {
    const fromSub = sub.split("•").map(x => x.trim()).filter(x => x && !/^(song|video|single|ep|album)$/i.test(x))[0] || "";
    return { kind: "track", id, title, artist: names || fromSub, artistId: artists[0]?.channel_id || "", meta: node.album?.name || "", cover: cover || `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`, video: kind === "video" };
  }
  return { kind, id: kind === "playlist" ? id.replace(/^VL/, "") : id, title, subtitle: sub || names, cover };
}
function homeShelf(node) {
  if (node?.type !== "MusicCarouselShelf") return null;
  const items = (node.contents || []).map(homeItem).filter(Boolean);
  const head = node.header, title = txt(head?.title);
  if (!items.length || !title) return null;
  const link = linkId(head?.title?.runs?.[0]?.endpoint) || linkId(head?.more_content?.endpoint);
  return { title, strap: txt(head?.strapline), link: link.startsWith("UC") ? link : "", items };
}
export async function fetchHomeFeed(pages = 4) {
  const yt = await getSignedInnertube();
  let feed = await yt.music.getHomeFeed();
  const out = [], seen = new Set();
  const take = f => {
    for (const sec of f.sections || []) {
      const shelf = homeShelf(sec);
      const key = shelf && shelf.title + "|" + shelf.items[0].id;
      if (shelf && !seen.has(key)) { seen.add(key); out.push(shelf); }
    }
  };
  take(feed);
  for (let n = 1; n < pages && feed.has_continuation; n++) {
    try { feed = await feed.getContinuation(); take(feed); } catch { break; }
  }
  return out;
}

// Sin adPlaybackContext (con él YouTube corta el audio a los ~70 s, según los docs de BitChord)
// Clientes en orden de preferencia. VISIONOS da URLs directas sin PO token; los demás son respaldo para vídeos
// "raros" (The Station, directos, sesiones...) en los que VISIONOS no da audio reproducible.
const CLIENTS = ["VISIONOS", "ANDROID_VR", "TV", "WEB_EMBEDDED"];
const hasUrl = f => !!(f.url || f.signature_cipher || f.cipher);
async function fetchInfo(yt, videoId, client) {
  const res = await yt.actions.execute("/player", {
    videoId, contentCheckOk: true, racyCheckOk: true, client,
    playbackContext: { contentPlaybackContext: { signatureTimestamp: yt.session.player?.signature_timestamp } },
  });
  return new YT.VideoInfo([res], yt.actions, Utils.generateRandomString(16));
}
// Fuentes de audio de una respuesta, de mejor a peor: webm/opus, mp4/aac y, como último recurso,
// el formato combinado (audio+vídeo, itag 18) que siempre se puede abrir en un <audio>.
const AUDIO_TARGET = { high: Infinity, medium: 128000, low: 0 };
const byQuality = aq => {
  const t = AUDIO_TARGET[aq] ?? Infinity;
  return t === Infinity ? (a, b) => b.bitrate - a.bitrate : (a, b) => Math.abs(a.bitrate - t) - Math.abs(b.bitrate - t);
};
function audioSources(info, yt, aq = "auto") {
  const order = byQuality(aq);
  const sd = info.streaming_data, probe = document.createElement("audio");
  const can = m => probe.canPlayType(m.replace(/;\s*/, "; ")) !== "";
  let audio = (sd?.adaptive_formats ?? []).filter(f => f.has_audio && !f.has_video && hasUrl(f) && !f.is_drc);
  const playable = audio.filter(f => can(f.mime_type)); if (playable.length) audio = playable;
  const by = m => audio.filter(f => f.mime_type.startsWith(m)).sort(order);
  const webm = by("audio/webm"), mp4 = by("audio/mp4");
  const first = can((webm[0] || {}).mime_type || "") || !mp4.length ? [webm[0], mp4[0], webm[1], mp4[1]] : [mp4[0], webm[0], mp4[1], webm[1]];
  const muxed = (sd?.formats ?? []).filter(f => f.has_audio && hasUrl(f)).sort(order).slice(0, 2);
  // Los formatos de directo/estreno (yt_live_broadcast) tienen duración falsa y acaban a los segundos: van al final
  const live = f => /yt_live_broadcast|source=yt_live/.test(f.url || "");
  const all = [...first, ...muxed].filter(Boolean);
  const mk = f => ({ itag: f.itag, bitrate: f.bitrate, mime: f.mime_type, muxed: !!f.has_video, live: live(f), url: () => f.decipher(yt.session.player), video: () => videoOffer(info, yt) });
  const normal = [...all.filter(f => !live(f)), ...all.filter(live)].map(mk);
  // Directos y estrenos: solo se reproducen bien con el manifiesto HLS de YouTube
  const hlsUrl = sd?.hls_manifest_url;
  const hls = hlsUrl ? [{ itag: "hls", mime: "application/x-mpegURL", muxed: true, hls: true, live: true, url: async () => hlsUrl, video: () => hlsVideoOffer(hlsUrl) }] : [];
  const liveish = !!(info.basic_info?.is_live || info.basic_info?.is_post_live_dvr || all.some(live));
  return liveish ? [...hls, ...normal] : [...normal, ...hls];
}
// Oferta de vídeo para HLS: el propio manifiesto (la calidad la elige hls.js / el navegador)
const hlsVideoOffer = url => ({ aspect: 16 / 9, heights: [], auto: 0, hls: true, async pick() { return { height: 0, url, hls: true }; } });
// Respuestas que dicen "inicia sesión": restricción de edad o comprobación anti-bot (BitChord: AGE_GATE en resolver.ts).
// En ambos casos una petición firmada con la cuenta del navegador (vía la extensión) suele pasar.
const GATE = /confirm your age|age-restricted|inappropriate for some users|sign in to confirm|not a bot/i;
const reasonOf = info => { const st = info?.playability_status; return st?.reason || st?.status || "sin respuesta"; };
const whyNot = (info, signed = false) => {
  const why = reasonOf(info);
  if (signed && GATE.test(why)) return new Error(`YouTube no aceptó tu sesión para esta canción (${why}). Comprueba que tienes la sesión iniciada en music.youtube.com (y la edad verificada si es una canción con restricción).`);
  if (/bot/i.test(why)) return new Error(`YouTube pidió verificar que no eres un bot (${why}). Inicia sesión en music.youtube.com en este navegador, recarga la extensión y reintenta.`);
  return new Error(/age|confirm/i.test(why) ? "Canción con restricción de edad: inicia sesión en YouTube Music en este navegador." : `YouTube: ${why}`);
};
// Con sesión, primero los clientes web (los que aceptan SAPISIDHASH); VISIONOS no necesita PO token, así que va primero aquí
const SIGNED_CLIENTS = ["VISIONOS", "YTMUSIC", "WEB"];
let signedFirstUntil = 0; // tras un bloqueo anti-bot, durante 10 min se pide directamente con la sesión
async function resolveWith(yt, videoId, aq, clients, signed) {
  let info = await fetchInfo(yt, videoId, clients[0]), used = 0;
  const firstErr = info;
  for (let c = 1; info.playability_status?.status !== "OK" && c < clients.length; c++) {
    try { const alt = await fetchInfo(yt, videoId, clients[c]); if (alt.playability_status?.status === "OK") { info = alt; used = c; } } catch {}
  }
  if (info.playability_status?.status !== "OK") throw Object.assign(whyNot(firstErr, signed), { gate: GATE.test(reasonOf(firstErr)), bot: /bot/i.test(reasonOf(firstErr)) });
  const sources = audioSources(info, yt, aq);
  // Otros clientes, solo si ninguna de las fuentes anteriores se deja reproducir
  const more = async () => {
    const out = [];
    for (let c = 0; c < clients.length; c++) {
      if (c === used) continue;
      try { const alt = await fetchInfo(yt, videoId, clients[c]); if (alt.playability_status?.status === "OK") out.push(...audioSources(alt, yt, aq)); } catch {}
    }
    return out;
  };
  if (!sources.length && !(await more().then(m => { sources.push(...m); return m.length }))) throw new Error("YouTube no dio una URL directa de audio para esta canción");
  const url = await sources[0].url();
  return { url, itag: sources[0].itag, bitrate: sources[0].bitrate, sources, more, duration: info.basic_info?.duration || 0, live: !!info.basic_info?.is_live, video: videoOffer(info, yt), signed };
}
export async function resolveStream(videoId, aq = "auto") {
  const anon = async () => resolveWith(await getInnertube(), videoId, aq, CLIENTS, false);
  const withAccount = async () => resolveWith(await getSignedInnertube(), videoId, aq, SIGNED_CLIENTS, true);
  // Como BitChord: anónimo primero; si YouTube pide iniciar sesión (edad o bot), se repite con la cuenta del navegador
  if (Date.now() < signedFirstUntil) { try { return await withAccount(); } catch { /* si la sesión falla, se prueba anónimo */ } }
  try { return await anon(); }
  catch (e) {
    if (!e.gate || isNative) throw e; // en la app de Android no hay extensión
    if (e.bot) signedFirstUntil = Date.now() + 10 * 60_000;
    try { return await withAccount(); }
    catch (e2) {
      // Sin sesión en el navegador, la extensión lo dice así: se explica con el mensaje de siempre
      if (/sesión de YouTube Music|not signed in/i.test(e2.message)) throw new Error(`${e.message.split(" (")[0]}: inicia sesión en music.youtube.com en este navegador y reintenta.`);
      throw e2;
    }
  }
}

// Foto del artista: avatar de la búsqueda de YouTube Music (nunca la portada de una canción)
export async function fetchArtistAvatar(name) {
  try {
    const yt = await getInnertube();
    const res = await yt.music.search(String(name || ""), { type: "artist" });
    const seen = new Set();
    const find = node => {
      if (!node || typeof node !== "object" || seen.has(node)) return null;
      seen.add(node);
      if ((node.item_type === "artist" || node.item_type === "library_artist") && node.thumbnails?.length) return node;
      for (const v of Object.values(node)) { if (Array.isArray(v)) { for (const c of v) { const f = find(c); if (f) return f; } } else if (v && typeof v === "object") { const f = find(v); if (f) return f; } }
      return null;
    };
    const a = find(res.contents);
    return [...(a?.thumbnails || [])].sort((x, y) => (y.width || 0) - (x.width || 0))[0]?.url || "";
  } catch { return ""; }
}

// Ficha de artista de YouTube Music: cabecera oficial, top canciones y estantes editoriales.
// Si solo tenemos el nombre, primero buscamos un canal de artista para obtener su browseId.
export async function fetchArtistPage(idOrName) {
  const yt = await getInnertube();
  let id = String(idOrName || "").trim();
  if (!id.startsWith("UC")) {
    const results = await yt.music.search(id, { type: "artist" });
    const seen = new Set();
    const findArtist = node => {
      if (!node || typeof node !== "object" || seen.has(node)) return null;
      seen.add(node);
      if ((node.item_type === "artist" || node.item_type === "library_artist") && String(node.id || "").startsWith("UC")) return node;
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) { const found = findArtist(child); if (found) return found; } }
        else if (value && typeof value === "object") { const found = findArtist(value); if (found) return found; }
      }
      return null;
    };
    const found = findArtist(results.contents);
    if (!found?.id) throw new Error("YouTube Music no encontró el perfil de ese artista.");
    id = found.id;
  }
  const page = await yt.music.getArtist(id);
  const header = page.header || {};
  const name = header.title?.text || header.title?.toString?.() || id;
  const pickImage = thumbs => [...(thumbs || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || "";
  // La cabecera cambia de forma según el artista (Immersive / Visual / Header): se prueban todas las rutas posibles
  let heroImage = [header.thumbnail?.contents, header.thumbnail, header.foreground_thumbnail, header.background?.contents, header.background, header.thumbnails]
    .map(t => pickImage(Array.isArray(t) ? t : [])).find(Boolean) || "";
  if (!heroImage) heroImage = await fetchArtistAvatar(name);
  const toTrack = item => {
    if (!item?.id || !item?.title) return null;
    const artists = item.artists?.map(a => a.name).filter(Boolean).join(", ") || name;
    const album = item.album?.name || "";
    return { id: item.id, title: String(item.title), artist: artists, artistId: id, album, meta: [album, item.duration?.text].filter(Boolean).join(" · "), cover: pickImage(item.thumbnails || item.thumbnail?.contents || []) || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`, video: false };
  };
  const topShelf = page.sections.find(section => section.type === "MusicShelf" && /top songs/i.test(section.title?.text || ""));
  let topSongs = (topShelf?.contents || []).map(toTrack).filter(Boolean);
  try {
    const all = await page.getAllSongs();
    if (all?.contents?.length) topSongs = all.contents.map(toTrack).filter(Boolean).slice(0, 20);
  } catch {}
  const shelves = page.sections.filter(section => section.type === "MusicCarouselShelf").map(section => {
    const rawTitle = section.header?.title?.text || "Más música";
    const title = /fans might also like|similar artists/i.test(rawTitle) ? "Artistas relacionados" : /albums/i.test(rawTitle) ? "Álbumes" : /singles|eps/i.test(rawTitle) ? "Sencillos y EP" : /videos/i.test(rawTitle) ? "Videos" : rawTitle;
    return {
    title,
    items: (section.contents || []).filter(item => item.id && item.title).map(item => ({
      id: item.id, title: String(item.title), subtitle: item.subtitle?.text || item.subtitle?.toString?.() || "",
      cover: pickImage(item.thumbnail || item.thumbnails || []), kind: item.item_type || "release"
    }))
  }; }).filter(section => section.items.length);
  const audience = header.subscription_button?.subscriber_count?.text || header.subscription_button?.short_subscriber_count?.text || "";
  return { id, name, heroImage, audience, description: header.description?.text || "", topSongs, shelves };
}

export async function fetchAlbumPage(albumId) {
  const yt = await getInnertube();
  const album = await yt.music.getAlbum(albumId);
  const header = album.header || {};
  const artist = header.author?.name || header.artists?.map(a => a.name).filter(Boolean).join(", ") || header.strapline_text_one?.text || "";
  const artistId = header.author?.channel_id || header.artists?.[0]?.channel_id || "";
  const albumName = header.title?.text || header.title?.toString?.() || "";
  const pickImage = thumbs => [...(thumbs || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || "";
  const cover = pickImage(header.thumbnails || header.thumbnail?.contents || []);
  const tracks = (album.contents || []).filter(item => item?.id && item?.title).map(item => ({
    id: item.id, title: String(item.title || ""), artist: item.artists?.map(a => a.name).filter(Boolean).join(", ") || artist,
    artistId: item.artists?.[0]?.channel_id || artistId, album: albumName, meta: [albumName, item.duration?.text].filter(Boolean).join(" · "),
    cover: pickImage(item.thumbnails || item.thumbnail?.contents || []) || cover || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`, video: item.item_type === "video",
    explicit: !!(item.is_explicit || item.badges?.some(b => /explicit/i.test(b?.icon_type || b?.label || ""))), dur: item.duration?.text || "", secs: item.duration?.seconds || 0
  }));
  const kind = String(header.subtitle?.text || header.subtitle?.toString?.() || "").split("•")[0].trim();
  const description = header.description?.description?.text || header.description?.text || "";
  return { id: albumId, title: albumName, artist, artistId, cover, kind, explicit: tracks.some(t => t.explicit), seconds: tracks.reduce((n, t) => n + t.secs, 0), year: header.year || "", trackCount: header.song_count || `${tracks.length} canciones`, description, tracks };
}
export async function fetchPlaylistPage(playlistId) {
  const yt = await getInnertube();
  const id = String(playlistId || "").replace(/^VL/, "");
  let pl;
  try { pl = await yt.music.getPlaylist(id); } catch { throw new Error("YouTube Music no pudo abrir esta lista."); }
  const header = pl.header || {};
  const pickImage = thumbs => [...(thumbs || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || "";
  const title = header.title?.text || header.title?.toString?.() || "Lista";
  const author = header.author?.name || header.strapline_text_one?.text || header.subtitle?.text || "";
  const cover = pickImage(header.thumbnails || header.thumbnail?.contents || []);
  let items = [...(pl.items || [])];
  for (let n = 0; n < 6 && pl.has_continuation; n++) {
    try { pl = await pl.getContinuation(); items.push(...(pl.items || [])); } catch { break; }
  }
  const tracks = items.filter(item => item?.id && item?.title).map(item => ({
    id: item.id, title: String(item.title || ""), artist: item.artists?.map(a => a.name).filter(Boolean).join(", ") || item.author?.name || author,
    artistId: item.artists?.[0]?.channel_id || "", album: item.album?.name || "", meta: [item.album?.name, item.duration?.text].filter(Boolean).join(" · "),
    cover: pickImage(item.thumbnails || item.thumbnail?.contents || []) || cover || `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`,
    video: item.item_type === "video", explicit: !!(item.is_explicit || item.badges?.some(b => /explicit/i.test(b?.icon_type || b?.label || ""))),
    dur: item.duration?.text || "", secs: item.duration?.seconds || 0
  }));
  if (!tracks.length) throw new Error("Esta lista no tiene canciones disponibles.");
  const description = header.description?.description?.text || header.description?.text || "";
  return { id, title, artist: author, artistId: "", cover: cover || tracks[0].cover, kind: "Lista", isPlaylist: true, explicit: false, seconds: tracks.reduce((n, t) => n + t.secs, 0), year: "", trackCount: `${tracks.length} canciones`, description, tracks };
}
export async function fetchAlbumTracks(albumId) { return (await fetchAlbumPage(albumId)).tracks; }

// Imagen del videoclip, como engine.videoStream de BitChord: formatos solo-vídeo con URL directa.
// Se descartan los "vídeos" cuadrados (la portada del álbum) y el HDR. H.264 primero: todos los navegadores lo decodifican por hardware.
const MIN_VIDEO_ASPECT = 1.2, AUTO_MAX_HEIGHT = 1080;
function videoOffer(info, yt) {
  const all = (info.streaming_data?.adaptive_formats ?? []).filter(f => f.has_video && f.width && f.height && (f.url || f.signature_cipher || f.cipher));
  const largest = [...all].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!largest || largest.width / largest.height < MIN_VIDEO_ASPECT) return null;
  const probe = document.createElement("video");
  const playable = all.filter(f => !/vp09\.0[23]|av01\.0\.\d+M\.(10|12)/.test(f.mime_type) && probe.canPlayType(f.mime_type.replace(/;\s*/, "; ")) !== "");
  const rank = f => (/avc1/.test(f.mime_type) ? 0 : /vp0?9/.test(f.mime_type) ? 1 : 2);
  const byHeight = new Map();
  for (const f of playable) { const cur = byHeight.get(f.height); if (!cur || rank(f) < rank(cur) || (rank(f) === rank(cur) && f.bitrate > cur.bitrate)) byHeight.set(f.height, f); }
  const heights = [...byHeight.keys()].sort((a, b) => b - a);
  if (!heights.length) return null;
  const auto = heights.find(h => h <= AUTO_MAX_HEIGHT) ?? heights.at(-1);
  return {
    aspect: largest.width / largest.height, heights, auto,
    // quality: altura fija o "auto". Si el vídeo no ofrece esa altura se usa la mejor que tenga.
    async pick(quality) {
      const h = quality === "auto" ? auto : byHeight.has(quality) ? quality : heights.find(x => x <= quality) ?? heights.at(-1), f = byHeight.get(h);
      return { height: h, url: await f.decipher(yt.session.player) };
    },
  };
}
