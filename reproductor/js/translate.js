const cache = new Map();
const URL_ = "https://translate.googleapis.com/translate_a/single";
async function one(text, tl, signal) {
  const key = tl + "|" + text;
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(`${URL_}?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`, { signal, credentials: "omit" });
  if (!r.ok) throw new Error("translate " + r.status);
  const j = await r.json();
  const out = { text: (j[0] || []).map(p => p[0]).join("").trim(), src: j[2] || "" };
  cache.set(key, out);
  return out;
}
export async function translateLines(texts, tl, onEach, signal) {
  const base = tl.split("-")[0];
  let next = 0, stop = false;
  const worker = async () => {
    while (!stop && !signal?.aborted) {
      const i = next++; if (i >= texts.length) return;
      const t = texts[i]; if (!t || !t.trim()) continue;
      try {
        const r = await one(t, tl, signal);
        if (r.src && r.src.split("-")[0] === base) { stop = true; return; }
        onEach(i, r.text);
      } catch (e) { if (signal?.aborted) return; }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
}
