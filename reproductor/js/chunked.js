
// Vídeo por tramos acotados.
//
// googlevideo frena cualquier respuesta abierta (la que pide un <video src> con "Range: bytes=N-")
// hasta más o menos la velocidad de reproducción: no queda ancho de banda de sobra para construir
// colchón, y a 1080p cualquier bache se convierte en parón. Pedido en tramos acotados
// (&range=inicio-fin, como hace la web de YouTube) cada tramo se sirve a toda velocidad.
//
// Esto hace lo mismo que un reproductor DASH, sin librería: lee el índice (sidx) del mp4, baja los
// segmentos por tramos de ~1 MB (varios a la vez) y los mete en un MediaSource. Si el formato no lo
// permite (webm, sin índice, sin MSE) attachChunked lanza y quien llama vuelve al <video src> normal.

const CHUNK = 1024 * 1024, NARROW = 512 * 1024;   // ANDROID_VR y TVHTML5_SIMPLY solo aguantan tramos más cortos
const AHEAD = 30, BEHIND = 20, PARALLEL = 4, TIMEOUT = 20000, EDGE = .5;

const mimeOf = f => String(f?.mime_type || "").replace(/;\s*/, "; ");
export const chunkedSupported = f => !!(globalThis.MediaSource && f?.init_range && f.index_range && f.content_length > 0
  && /^video\/mp4/.test(mimeOf(f)) && MediaSource.isTypeSupported(mimeOf(f)));

export const chunkFor = url => {
  const u = new URL(url), c = (u.searchParams.get("c") || "").toUpperCase();
  return /googlevideo\.com$/.test(u.hostname) && (c === "ANDROID_VR" || c.startsWith("TVHTML5_SIMPLY")) ? NARROW : CHUNK;
};

// fetch con tiempo máximo y reintentos; un abort de fuera no se reintenta
async function fetchRange(url, a, b, signal) {
  const u = new URL(url); u.searchParams.set("range", `${a}-${b}`);
  let err;
  for (let k = 0; k < 3; k++) {
    const ctl = new AbortController(), kill = () => ctl.abort();
    const timer = setTimeout(kill, TIMEOUT); signal.addEventListener("abort", kill, { once: true });
    try {
      const r = await fetch(u, { signal: ctl.signal, credentials: "omit" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== b - a + 1) throw new Error(`tramo incompleto (${buf.byteLength} de ${b - a + 1})`);
      return buf;
    } catch (e) {
      err = e; if (signal.aborted) throw Object.assign(new Error("cancelado"), { name: "AbortError" });
      await new Promise(r => setTimeout(r, 300 * 2 ** k));
    } finally { clearTimeout(timer); signal.removeEventListener("abort", kill); }
  }
  throw err;
}

// Bytes a..b en tramos paralelos, unidos en orden
export async function fetchSpan(url, a, b, step, signal, stat) {
  const parts = []; for (let p = a; p <= b; p += step) parts.push([p, Math.min(p + step - 1, b)]);
  const out = new Array(parts.length); let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, async () => {
    while (next < parts.length) { const i = next++; out[i] = await fetchRange(url, parts[i][0], parts[i][1], signal); }
  }));
  const total = b - a + 1, dt = (performance.now() - t0) / 1000;
  if (stat && dt > .05) stat.bps = total * 8 / dt;
  if (out.length === 1) return out[0];
  const all = new Uint8Array(total); let o = 0; for (const x of out) { all.set(new Uint8Array(x), o); o += x.byteLength; }
  return all.buffer;
}

// sidx → segmentos {t0, t1, a, b}; base = byte que sigue a la caja sidx
export function parseSidx(buf, base) {
  const v = new DataView(buf);
  if (buf.byteLength < 32 || String.fromCharCode(...new Uint8Array(buf, 4, 4)) !== "sidx") throw new Error("sin sidx");
  let o = 8; const ver = v.getUint8(o); o += 8;                       // versión+flags, reference_ID
  const ts = v.getUint32(o); o += 4;
  let t, first;
  if (ver === 0) { t = v.getUint32(o); first = v.getUint32(o + 4); o += 8; }
  else { t = Number(v.getBigUint64(o)); first = Number(v.getBigUint64(o + 8)); o += 16; }
  o += 2; const n = v.getUint16(o); o += 2;
  if (!ts || !n) throw new Error("sidx vacío");
  const segs = []; let pos = base + first;
  for (let i = 0; i < n; i++, o += 12) {
    const w = v.getUint32(o), size = w & 0x7fffffff, dur = v.getUint32(o + 4);
    if (w >>> 31) throw new Error("sidx jerárquico");
    segs.push({ t0: t / ts, t1: (t + dur) / ts, a: pos, b: pos + size - 1 }); t += dur; pos += size;
  }
  return segs;
}

// start(): segundo desde el que arrancar antes de que el <video> tenga metadatos. onError(e): fallo sin remedio a mitad.
export async function attachChunked(el, { url, fmt, start = () => 0, onError = null }) {
  const ac = new AbortController(), step = chunkFor(url), stat = { bps: 0 };
  const ms = new MediaSource(), objUrl = URL.createObjectURL(ms);
  let dead = false, inflight = null, wake = null;
  const stop = () => { dead = true; ac.abort(); wake?.(); try { URL.revokeObjectURL(objUrl); } catch {} };
  stop.stat = stat;
  try {
    el.src = objUrl;
    await new Promise((ok, no) => { ms.addEventListener("sourceopen", ok, { once: true }); setTimeout(() => no(new Error("MediaSource no abre")), 5000); });
    const sb = ms.addSourceBuffer(mimeOf(fmt));
    const op = fn => new Promise((ok, no) => {
      const off = () => { sb.removeEventListener("updateend", done); sb.removeEventListener("error", bad); };
      const done = () => { off(); ok(); }, bad = () => { off(); no(new Error("SourceBuffer")); };
      sb.addEventListener("updateend", done); sb.addEventListener("error", bad);
      try { fn(); } catch (e) { off(); no(e); }
    });
    const r = fmt.init_range, ix = fmt.index_range;
    const [init, idx] = await Promise.all([r, ix].map(x => fetchRange(url, x.start, x.end, ac.signal)));
    const segs = parseSidx(idx, ix.end + 1);
    ms.duration = segs.at(-1).t1;
    await op(() => sb.appendBuffer(init));

    const loaded = new Set();
    const covered = s => { const b = sb.buffered; for (let i = 0; i < b.length; i++) if (b.start(i) <= s.t0 + EDGE && b.end(i) >= s.t1 - EDGE) return true; return false; };
    const present = i => loaded.has(i) && (covered(segs[i]) || (loaded.delete(i), false));
    const pos = () => el.readyState >= 1 ? el.currentTime : start();
    const trim = async t => {
      const b = sb.buffered, cut = t - BEHIND;
      if (!b.length || b.start(0) >= cut - 5 || cut <= 0) return;
      await op(() => sb.remove(0, cut));
      for (const i of [...loaded]) if (segs[i].t0 < cut) loaded.delete(i);
    };
    const nudge = () => {
      if (inflight && Math.abs(el.currentTime - inflight.seg.t0) > AHEAD) inflight.ctl.abort();   // salto lejos: no sigas bajando lo viejo
      wake?.();
    };
    el.addEventListener("seeking", nudge); el.addEventListener("waiting", nudge);
    const sleep = ms2 => new Promise(ok => { wake = ok; setTimeout(ok, ms2); });

    (async () => {
      let quota = 0;
      while (!dead) {
        try {
          const t = Math.max(0, pos());
          let i = segs.findIndex(s => t < s.t1); if (i < 0) i = segs.length - 1;
          let want = -1;
          for (let k = i; k < segs.length && segs[k].t0 < t + AHEAD; k++) if (!present(k)) { want = k; break; }
          if (want < 0) {
            if (loaded.size === segs.length && ms.readyState === "open" && !sb.updating) { try { ms.endOfStream(); } catch {} }
            await trim(t); await sleep(400); continue;
          }
          const seg = segs[want], ctl = new AbortController(), link = () => ctl.abort();
          ac.signal.addEventListener("abort", link, { once: true }); inflight = { seg, ctl };
          let data;
          try { data = await fetchSpan(url, seg.a, seg.b, step, ctl.signal, stat); }
          finally { inflight = null; ac.signal.removeEventListener("abort", link); }
          if (dead) return;
          try { await op(() => sb.appendBuffer(data)); loaded.add(want); quota = 0; }
          catch (e) {
            if (e?.name !== "QuotaExceededError" || quota++ > 1) throw e;
            await op(() => sb.remove(0, Math.max(0, pos() - 2)));           // sin sitio: suelta lo de atrás y reintenta
            loaded.clear();
          }
        } catch (e) {
          if (dead) return;
          if (e?.name === "AbortError") continue;
          dead = true; wake?.(); onError?.(e); return;
        }
      }
    })();

    const detach = () => { stop(); el.removeEventListener("seeking", nudge); el.removeEventListener("waiting", nudge); };
    detach.stat = stat; detach.chunked = true;
    return detach;
  } catch (e) { stop(); try { el.removeAttribute("src"); el.load(); } catch {} throw e; }
}
