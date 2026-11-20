# Método ytfetch para FrikiMusic Bridge

La web llama a `bridge("ytfetch", { url, method, headers, body, auth: true })` y espera `{ status, headers, bodyEncoding, body }`.
Es la misma idea que `yt.fetch` con `auth` de BitChord (web/extension/lib/ytFetch.ts y ytAuth.ts).

1. Copia `ytsigned.js` junto al background de la extensión.
2. En el background, importa `ytFetch` y añade al manejador de métodos, junto a `search`, `home` y `lyrics`:
   `ytfetch: params => ytFetch(params)`
3. En el manifest.json, permisos: `"cookies"`, `"declarativeNetRequest"` y host `"https://*.youtube.com/*"`.
4. Recarga la extensión.

Sin ese método, la web usa el `home` de siempre.
