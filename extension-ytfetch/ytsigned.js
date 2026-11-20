const MUSIC = "https://music.youtube.com";
const ALLOWED = /^https:\/\/(music|www)\.youtube\.com\/youtubei\/v1\//;
const SECRETS = ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"];
const IDENTITY = ["authorization", "cookie", "x-goog-authuser", "x-goog-pageid", "x-origin", "origin", "referer"];
const RULE_ID = 9101;
let ruleReady = null;
let indexCache = null;

async function secret() {
  for (const name of SECRETS) {
    const c = await chrome.cookies.get({ url: MUSIC + "/", name }).catch(() => null);
    if (c?.value) return c.value;
  }
  return null;
}

async function sapisidHash(value, origin) {
  const ts = Math.floor(Date.now() / 1000);
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${ts} ${value} ${origin}`));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `SAPISIDHASH ${ts}_${hex}`;
}

function installRule() {
  ruleReady ??= chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [{
      id: RULE_ID,
      priority: 1,
      condition: { urlFilter: "||music.youtube.com/", tabIds: [-1], resourceTypes: ["xmlhttprequest"] },
      action: { type: "modifyHeaders", requestHeaders: [{ header: "Origin", operation: "set", value: MUSIC }, { header: "Referer", operation: "set", value: MUSIC + "/" }] },
    }],
  }).catch(e => { ruleReady = null; throw e; });
  return ruleReady;
}

async function sessionIndex(value) {
  if (indexCache && Date.now() - indexCache.at < 600000) return indexCache.value;
  let found = "0";
  try {
    const r = await fetch(MUSIC + "/", { headers: { Authorization: await sapisidHash(value, MUSIC), "X-Origin": MUSIC }, credentials: "include" });
    found = /"SESSION_INDEX":"?(\d+)/.exec(await r.text())?.[1] ?? "0";
  } catch {}
  indexCache = { value: found, at: Date.now() };
  return found;
}

export async function ytFetch({ url, method = "GET", headers = {}, body }) {
  if (!ALLOWED.test(url)) throw Object.assign(new Error("ytfetch no sirve " + url), { code: "forbidden" });
  const value = await secret();
  if (!value) throw Object.assign(new Error("El navegador no tiene sesión de YouTube."), { code: "unauthenticated" });
  await installRule();
  const origin = new URL(url).origin;
  const out = new Headers();
  for (const [k, v] of Object.entries(headers)) if (!IDENTITY.includes(k.toLowerCase())) out.set(k, v);
  out.set("Authorization", await sapisidHash(value, origin));
  out.set("X-Goog-AuthUser", await sessionIndex(value));
  out.set("X-Origin", origin);
  const r = await fetch(url, { method, headers: out, body: body ?? null, credentials: "include" });
  const resHeaders = {};
  r.headers.forEach((v, k) => { resHeaders[k] = v; });
  return { status: r.status, headers: resHeaders, url: r.url, bodyEncoding: "text", body: await r.text() };
}
