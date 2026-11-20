

const native = () => document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== "";
let loading = null;
export const loadHls = () => loading ??= new Promise(ok => {
  if (globalThis.Hls) return ok(globalThis.Hls);
  const s = document.createElement("script");
  s.src = new URL("../vendor/hls.min.js", import.meta.url).href;
  s.onload = () => ok(globalThis.Hls || null); s.onerror = () => ok(null);
  document.head.append(s);
});
const levelsOf = h => h.levels.map((l, i) => ({ i, height: l.height || 0, bitrate: l.bitrate || 0 })).sort((a, b) => a.bitrate - b.bitrate);
const audioLevel = (ls, q) => !ls.length ? -1 : q === "high" ? ls.at(-1).i : q === "medium" ? ls[Math.floor((ls.length - 1) / 2)].i : ls[0].i;
const heightLevel = (ls, q) => {
  const ok = ls.filter(l => l.height > 0);
  if (!(q > 0) || !ok.length) return -1;
  const exact = ok.filter(l => l.height === q), lower = ok.filter(l => l.height <= q);
  return (exact.length ? exact : lower.length ? lower : [ok[0]]).at(-1).i;
};
export async function attachHls(el, url, { audio = null, height = "auto", onLevel = null } = {}) {
  const Hls = await loadHls();
  if (!Hls?.isSupported?.()) {
    if (native()) { console.info("FrikiMusic: HLS nativo (hls.js no disponible)"); el.src = url; return () => {}; }
    throw new Error("Este vídeo es un directo y necesita hls.js: copia hls.min.js en reproductor/vendor/");
  }
  const h = new Hls({ enableWorker: true, lowLatencyMode: false, startPosition: -1, maxBufferLength: 30 });
  let ready = false, media = 0, net = 0;
  const stop = () => { try { h.destroy(); } catch {} };
  stop.heights = [];
  stop.setHeight = q => { h.currentLevel = heightLevel(levelsOf(h), q); };
  stop.setAudio = q => { h.currentLevel = audioLevel(levelsOf(h), q); };
  stop.current = () => h.levels[h.currentLevel >= 0 ? h.currentLevel : h.loadLevel]?.height || 0;
  await new Promise((ok, no) => {
    const fail = e => { stop(); no(e); };
    const t = setTimeout(() => fail(new Error("HLS: tiempo agotado")), 15000);
    h.on(Hls.Events.MANIFEST_PARSED, () => {
      clearTimeout(t); ready = true;
      stop.heights = [...new Set(h.levels.map(l => l.height || 0).filter(x => x > 0))].sort((a, b) => b - a);
      if (audio) stop.setAudio(audio); else stop.setHeight(height);
      ok();
    });
    h.on(Hls.Events.LEVEL_SWITCHED, () => onLevel?.());
    h.on(Hls.Events.ERROR, (_, d) => {
      console.warn("FrikiMusic HLS:", d.type, d.details, d.fatal ? "(fatal)" : "");
      if (!d.fatal) return;
      if (!ready) { clearTimeout(t); return fail(new Error(`HLS ${d.type}/${d.details}`)); }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && media++ < 3) h.recoverMediaError();
      else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 3) h.startLoad();
      else stop();
    });
    h.loadSource(url); h.attachMedia(el);
  });
  return stop;
}
