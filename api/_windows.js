// Localiza el instalador de Windows (.exe) más reciente del repositorio de releases.
// Orden: 1) API de GitHub  2) feed Atom + páginas HTML de assets (no gastan el límite de la API)  3) último .exe conocido.
const REPO = 'jv8784815-ctrl/repositpory-for-apk-3wfqewfd32134';
const LAST_KNOWN = {
  version: 'v2.3.0',
  name: 'FrikiMusic-Setup-2.3.0.exe',
  url: 'https://github.com/' + REPO + '/releases/download/v2.3.0/FrikiMusic-Setup-2.3.0.exe',
  size: null,
  publishedAt: null
};

const isWin = (n) => /\.(exe|msi)$/i.test(n || '');
const pickBest = (assets) =>
  assets.find((a) => /\.exe$/i.test(a.name)) || assets.find((a) => /\.msi$/i.test(a.name)) || null;

let cache = { at: 0, value: null };
const TTL = 10 * 60 * 1000;

async function viaApi() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const r = await fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=30', { headers });
  if (!r.ok) throw new Error('API ' + r.status);
  const releases = await r.json();
  for (const rel of releases) {
    if (rel.draft) continue;
    const a = pickBest((rel.assets || []).filter((x) => isWin(x.name)));
    if (a) {
      return {
        version: rel.tag_name || rel.name,
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
        publishedAt: rel.published_at || rel.created_at || null
      };
    }
  }
  throw new Error('Sin instalador en la API');
}

async function viaHtml() {
  const feed = await fetch('https://github.com/' + REPO + '/releases.atom');
  if (!feed.ok) throw new Error('Atom ' + feed.status);
  const xml = await feed.text();
  const tags = [...xml.matchAll(/\/releases\/tag\/([^"<]+)"/g)].map((m) => decodeURIComponent(m[1])).slice(0, 12);
  for (const tag of tags) {
    const r = await fetch('https://github.com/' + REPO + '/releases/expanded_assets/' + encodeURIComponent(tag));
    if (!r.ok) continue;
    const html = await r.text();
    const hrefs = [...html.matchAll(/href="([^"]*\/releases\/download\/[^"]+)"/g)].map((m) => m[1]);
    const exe = hrefs.find((h) => /\.exe$/i.test(h)) || hrefs.find((h) => /\.msi$/i.test(h));
    if (exe) {
      return {
        version: tag,
        name: decodeURIComponent(exe.split('/').pop()),
        url: 'https://github.com' + exe,
        size: null,
        publishedAt: null
      };
    }
  }
  throw new Error('Sin instalador en el HTML');
}

async function findWindows() {
  if (cache.value && Date.now() - cache.at < TTL) return cache.value;
  let value;
  try { value = await viaApi(); }
  catch (e1) {
    try { value = await viaHtml(); }
    catch (e2) { value = LAST_KNOWN; }
  }
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { findWindows, REPO };
