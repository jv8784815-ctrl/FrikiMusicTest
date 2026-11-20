

export const isNative = !!globalThis.Capacitor?.isNativePlatform?.();
if (isNative) { const m = document.createElement("meta"); m.name = "referrer"; m.content = "no-referrer"; document.head.append(m); }

const YT = "https://music.youtube.com", WWW = "https://www.youtube.com";
const SONGS = "EgWKAQIIAWoMEA4QChADEAQQCRAF";
const WEB = { client: { clientName: "WEB_REMIX", clientVersion: "1.20260818.08.00", hl: "en", gl: "US" } };
const SAFE = new Set(["accept", "accept-language", "content-language"]);

export async function nfetch(input, init = {}) {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : input.toString());
  const method = init.method ?? req?.method ?? "GET";
  const headers = { "User-Agent": navigator.userAgent, "Accept-Language": "en-US,en;q=0.9" };
  new Headers(init.headers ?? req?.headers).forEach((v, k) => SAFE.has(k.toLowerCase()) && (headers[k] = v));
  let body = init.body;
  if (body === undefined && req && method !== "GET" && method !== "HEAD") body = await req.text();
  if (body != null) headers["Content-Type"] = "text/plain;charset=UTF-8";
  const origin = { "music.youtube.com": YT, "www.youtube.com": WWW }[url.hostname];
  if (origin && url.pathname.startsWith("/youtubei/")) Object.assign(headers, { Origin: origin, Referer: origin + "/", "X-Origin": origin });
  const http = globalThis.Capacitor?.Plugins?.CapacitorHttp;
  if (!http) throw new Error("Falta el plugin CapacitorHttp");
  const r = await http.request({ url: url.href, method, headers, data: body ?? undefined, responseType: "text", connectTimeout: 15000, readTimeout: 30000 });
  const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? "");
  return new Response([101, 204, 205, 304].includes(r.status) ? null : text, { status: r.status, headers: r.headers });
}

const walk = (o, key, out = []) => { if (o && typeof o === "object") for (const k in o) k === key ? out.push(o[k]) : walk(o[k], key, out); return out; };
const runs = c => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

const VIDEOS = "EgWKAQIQAWoMEA4QChADEAQQCRAF";
const TYPE = x => x?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || "";

const isVideo = t => !!t && t !== "MUSIC_VIDEO_TYPE_ATV";
const KIND = /^(song|video|canción|cancion|vídeo|single|ep|álbum|album)$/i;
const thumb = th => th?.at(-1)?.url || "";
const cover = (th, id) => thumb(th) || (id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : "");
const runArtistId = rs => (rs || []).map(r => r.navigationEndpoint?.browseEndpoint?.browseId || r.endpoint?.payload?.browseId).find(id => typeof id === "string" && id.startsWith("UC")) || "";

function groups(rs) {
  const out = [""];
  for (const r of rs) { if (r.text.trim() === "•") out.push(""); else out[out.length - 1] += r.text; }
  const g = out.map(x => x.trim()).filter(Boolean);
  if (g.length && KIND.test(g[0])) g.shift();
  return g;
}
function subtitle(rs) { const g = groups(rs); return { artist: g[0] || "", meta: g.slice(1).join(" · ") }; }

function listItem(x) {
  const id = x.playlistItemData?.videoId; if (!id) return null;
  const type = TYPE(x.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint)
    || TYPE(x.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint);
  const g = groups(runs(x.flexColumns[1]));
  const artistId = runArtistId(runs(x.flexColumns[1]));
  const timed = /^\d+:\d{2}/.test(g.at(-1) || "");
  return { id, title: runs(x.flexColumns[0]).map(t => t.text).join(""), artist: g[0] || "", artistId, meta: g.slice(1).join(" · "), album: timed && g.length > 2 ? g[1] : null, cover: cover(x.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, id), video: isVideo(type) };
}

function cardItem(x) {
  const ep = x.navigationEndpoint, id = ep?.watchEndpoint?.videoId; if (!id) return null;
  const { artist, meta } = subtitle(x.subtitle?.runs || []);
  return { id, title: (x.title?.runs || []).map(r => r.text).join(""), artist, artistId: runArtistId(x.subtitle?.runs), meta, cover: cover(x.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails, id), video: isVideo(TYPE(ep)) };
}
const post = async (path, body, query = "") => {
  const r = await nfetch(`${YT}/youtubei/v1/${path}?prettyPrint=false${query}`, { method: "POST", body: JSON.stringify({ context: WEB, ...body }) });
  if (!r.ok) throw new Error(`YouTube respondió ${r.status}`);
  return r.json();
};
async function searchOne(query, params) {
  return walk(await post("search", { query, params }), "musicResponsiveListItemRenderer").map(listItem).filter(Boolean).map(item => params === VIDEOS ? { ...item, video: true } : item);
}

async function search({ query }) {
  const [songs, vids] = await Promise.all([searchOne(query, SONGS), searchOne(query, VIDEOS).catch(() => [])]);
  const seen = new Set(), out = [];
  for (let i = 0; i < Math.max(songs.length, vids.length); i++) for (const x of [songs[i], vids[i]]) if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); }
  return out;
}
const plain = rs => (rs || []).map(r => r.text).join("");
const isTrack = x => !x.kind || x.kind === "track";
function twoRow(x) {
  const ep = x.navigationEndpoint || {}, sub = x.subtitle?.runs || [];
  const art = x.thumbnailRenderer?.musicThumbnailRenderer;
  const base = { title: plain(x.title?.runs), subtitle: plain(sub), cover: thumb(art?.thumbnail?.thumbnails) };
  if (ep.watchEndpoint?.videoId) { const t = cardItem(x); return t && { ...t, kind: "track" }; }
  const browse = ep.browseEndpoint?.browseId || "", list = ep.watchPlaylistEndpoint?.playlistId || "";
  if (browse.startsWith("VL")) return { ...base, kind: "playlist", id: browse.slice(2) };
  if (browse.startsWith("MPRE")) return { ...base, kind: "album", id: browse };
  if (browse.startsWith("UC")) return { ...base, kind: "artist", id: browse };
  if (list) return { ...base, kind: "playlist", id: list };
  return null;
}
export function parseHome(pages) {
  const sections = [], seen = new Set();
  for (const page of [].concat(pages || [])) {
    for (const sh of walk(page, "musicCarouselShelfRenderer")) {
      const head = sh.header?.musicCarouselShelfBasicHeaderRenderer;
      const title = plain(head?.title?.runs);
      const items = (sh.contents || []).map(c => c.musicTwoRowItemRenderer ? twoRow(c.musicTwoRowItemRenderer) : c.musicResponsiveListItemRenderer ? { ...listItem(c.musicResponsiveListItemRenderer), kind: "track" } : null).filter(x => x && x.id);
      const key = title + "|" + (items[0]?.id || "");
      if (!title || !items.length || seen.has(key)) continue;
      seen.add(key);
      const link = head?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
      sections.push({ title, strap: plain(head?.strapline?.runs), link, items });
    }
  }
  return sections;
}
async function homeRaw() {
  const pages = [await post("browse", { browseId: "FEmusic_home" })];
  let token = walk(pages[0], "nextContinuationData")[0]?.continuation;
  for (let n = 0; token && n < 5; n++) {
    const next = await post("browse", { continuation: token }, `&ctoken=${encodeURIComponent(token)}&continuation=${encodeURIComponent(token)}&type=next`);
    pages.push(next);
    token = walk(next, "nextContinuationData")[0]?.continuation;
  }
  return pages;
}
async function home() { return parseHome(await homeRaw()); }

const LYRIC_HOSTS = new Set(["lrc.red", "lyrics-api.binimum.org", "lyrics-api.boidu.dev", "unison.boidu.dev", "lyricsplus.prjktla.my.id", "lyricsplus.binimum.org", "lrclib.net", "api-lyrics.simpmusic.org", "lyrics.paxsenix.org", "lyrics.kugou.com", "www.megalobiz.com"]);
async function lyrics({ url }) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !LYRIC_HOSTS.has(u.hostname)) throw new Error("Host de letras no permitido");
  const r = await nfetch(u.href, { headers: { Accept: "application/json, text/plain, */*" } });
  return r.ok ? await r.text() : null;
}
const methods = { ping: async () => ({ version: "android" }), rules: async () => ({ ids: [], session: [] }), search, home, homeRaw, lyrics };
export const nativeBridge = (method, params = {}) => methods[method] ? methods[method](params) : Promise.reject(new Error("Método desconocido: " + method));
