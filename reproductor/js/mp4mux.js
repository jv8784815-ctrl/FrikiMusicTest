// Une un MP4 fragmentado de vídeo y otro de audio (los DASH de YouTube vienen separados) en UN MP4 NORMAL
// (no fragmentado: ftyp + moov con tablas de muestras + mdat), sin recodificar ni librerías.
// Por qué no basta con mezclar fragmentos: el Reproductor de Windows (y muchos otros) no abren bien los MP4
// fragmentados sin sidx/mfra, y VLC se traba al no tener el índice de muestras. Un MP4 clásico con moov
// delante (faststart) lo abre cualquier reproductor. Pistas: vídeo = 1, audio = 2.
// Solo sirve para MP4 (H.264/AV1 + AAC); WebM necesitaría otro contenedor.

const td = new TextDecoder("latin1");
const type4 = (b, o) => td.decode(b.subarray(o, o + 4));

function* boxes(b, start = 0, end = b.length) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = start; o + 8 <= end;) {
    let size = v.getUint32(o), hdr = 8;
    if (size === 1) { size = Number(v.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) throw new Error("MP4 dañado (caja fuera de rango)");
    yield { type: type4(b, o + 4), start: o, hdr, end: o + size, body: o + hdr };
    o += size;
  }
}
const child = (b, bx, name) => { for (const c of boxes(b, bx.body, bx.end)) if (c.type === name) return c; return null; };
const need = (x, what) => { if (!x) throw new Error("MP4 sin " + what); return x; };
const dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength);

function box(name, ...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(8 + len);
  new DataView(out.buffer).setUint32(0, 8 + len);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  let o = 8; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const fullBox = (name, ver, flags, ...parts) => box(name, new Uint8Array([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const u32s = arr => { const o = new Uint8Array(arr.length * 4), v = new DataView(o.buffer); for (let i = 0; i < arr.length; i++) v.setUint32(i * 4, arr[i] >>> 0); return o; };
const u64s = arr => { const o = new Uint8Array(arr.length * 8), v = new DataView(o.buffer); for (let i = 0; i < arr.length; i++) v.setBigUint64(i * 8, BigInt(arr[i])); return o; };
const str4 = s => Uint8Array.from(s, c => c.charCodeAt(0));

// ---------- lectura de un MP4 fragmentado (una pista) ----------
function readSource(buf, label) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let moov = null; const frags = []; let pending = null;
  for (const bx of boxes(b)) {
    if (bx.type === "moov") moov = bx;
    else if (bx.type === "moof") pending = bx;
    else if (bx.type === "mdat" && pending) { frags.push({ moof: pending, mdat: bx }); pending = null; }
  }
  need(moov, `moov en el ${label}`);
  if (!frags.length) throw new Error(`El ${label} no es un MP4 fragmentado`);
  const traks = [...boxes(b, moov.body, moov.end)].filter(x => x.type === "trak");
  if (traks.length !== 1) throw new Error(`El ${label} tiene ${traks.length} pistas (se esperaba 1)`);
  const trak = traks[0], v = dv(b);
  const mdia = need(child(b, trak, "mdia"), "mdia"), mdhd = need(child(b, mdia, "mdhd"), "mdhd");
  const scale = v.getUint32(mdhd.body + (b[mdhd.body] === 1 ? 20 : 12));
  if (!scale) throw new Error("timescale 0");

  // valores por defecto de mvex/trex
  const trex = { dur: 0, size: 0, flags: 0 };
  const mvex = child(b, moov, "mvex"), tx = mvex && child(b, mvex, "trex");
  if (tx) { trex.dur = v.getUint32(tx.body + 12); trex.size = v.getUint32(tx.body + 16); trex.flags = v.getUint32(tx.body + 20); }

  const samples = [];                                    // { dur, size, flags, cts, off }
  for (const f of frags) {
    for (const traf of boxes(b, f.moof.body, f.moof.end)) {
      if (traf.type !== "traf") continue;
      const tfhd = need(child(b, traf, "tfhd"), "tfhd"), tf = v.getUint32(tfhd.body) & 0xffffff;
      let p = tfhd.body + 8, base = f.moof.start;
      if (tf & 0x01) { base = Number(v.getBigUint64(p)); p += 8; }
      if (tf & 0x02) p += 4;
      let dDur = trex.dur, dSize = trex.size, dFlags = trex.flags;
      if (tf & 0x08) { dDur = v.getUint32(p); p += 4; }
      if (tf & 0x10) { dSize = v.getUint32(p); p += 4; }
      if (tf & 0x20) { dFlags = v.getUint32(p); p += 4; }
      let cursor = f.mdat.body;
      for (const tr of boxes(b, traf.body, traf.end)) {
        if (tr.type !== "trun") continue;
        const fl = v.getUint32(tr.body) & 0xffffff, ver = b[tr.body], n = v.getUint32(tr.body + 4);
        let q = tr.body + 8, off = cursor, first = null;
        if (fl & 0x01) { off = base + v.getInt32(q); q += 4; }
        if (fl & 0x04) { first = v.getUint32(q); q += 4; }
        for (let i = 0; i < n; i++) {
          let dur = dDur, size = dSize, flags = (i === 0 && first !== null) ? first : dFlags, cts = 0;
          if (fl & 0x100) { dur = v.getUint32(q); q += 4; }
          if (fl & 0x200) { size = v.getUint32(q); q += 4; }
          if (fl & 0x400) { flags = v.getUint32(q); q += 4; }
          if (fl & 0x800) { cts = ver ? v.getInt32(q) : v.getUint32(q); q += 4; }
          samples.push({ dur, size, flags, cts, off });
          off += size;
        }
        cursor = off;
      }
    }
  }
  if (!samples.length) throw new Error(`El ${label} no tiene muestras`);
  if (samples.some(s => s.off + s.size > b.length)) throw new Error(`El ${label} está incompleto (faltan datos)`);

  // elst original (p. ej. el "priming" del audio AAC)
  let origMT = 0;
  const edts = child(b, trak, "edts"), elst = edts && child(b, edts, "elst");
  if (elst && v.getUint32(elst.body + 4) > 0) {
    const mt = b[elst.body] === 1 ? Number(v.getBigInt64(elst.body + 16)) : v.getInt32(elst.body + 12);
    if (mt > 0) origMT = mt;
  }

  // trozos (chunks) de ~1 s de muestras contiguas, para intercalar audio y vídeo con grano fino
  const chunks = []; let dts = 0, cur = null;
  for (const s of samples) {
    if (!cur || s.off !== cur.start + cur.len || cur.ticks >= scale) { cur = { start: s.off, len: 0, n: 0, ticks: 0, t: dts / scale }; chunks.push(cur); }
    cur.len += s.size; cur.n++; cur.ticks += s.dur; dts += s.dur;
  }
  return { b, trak, moov, scale, samples, chunks, mediaDur: dts, origMT };
}

// ---------- tablas de muestras ----------
const rle = (vals, key = x => x) => {                    // [[valor, repeticiones], ...]
  const out = []; for (const x of vals) { const k = key(x), l = out[out.length - 1]; if (l && l[0] === k) l[1]++; else out.push([k, 1]); } return out;
};

function sampleTables(T, chunkOffsets, co64) {
  const { samples, chunks } = T;
  const dr = rle(samples, s => s.dur), kids = [fullBox("stts", 0, 0, u32s([dr.length, ...dr.map(([d, n]) => [n, d]).flat()]))];
  if (samples.some(s => s.cts !== 0)) {
    const neg = samples.some(s => s.cts < 0), r = rle(samples, s => s.cts);
    kids.push(fullBox("ctts", neg ? 1 : 0, 0, u32s([r.length, ...r.map(([c, n]) => [n, c]).flat()])));
  }
  const nonSync = s => (s.flags & 0x10000) !== 0;
  if (samples.some(nonSync)) {
    const idx = []; samples.forEach((s, i) => { if (!nonSync(s)) idx.push(i + 1); });
    kids.push(fullBox("stss", 0, 0, u32s([idx.length, ...idx])));
  }
  const sc = []; let prev = -1;
  chunks.forEach((c, i) => { if (c.n !== prev) { sc.push(i + 1, c.n, 1); prev = c.n; } });
  kids.push(fullBox("stsc", 0, 0, u32s([sc.length / 3, ...sc])));
  kids.push(fullBox("stsz", 0, 0, u32s([0, samples.length, ...samples.map(s => s.size)])));
  kids.push(co64 ? fullBox("co64", 0, 0, u32s([chunks.length]), u64s(chunkOffsets)) : fullBox("stco", 0, 0, u32s([chunks.length, ...chunkOffsets])));
  return kids;
}

// ---------- moov ----------
function patchDuration(box_, ver, off32, off64, value) {
  const v = dv(box_);
  if (ver === 1) v.setBigUint64(off64, BigInt(value)); else v.setUint32(off32, Math.min(value, 0xffffffff));
}

function makeTrak(T, id, movScale, chunkOffsets, co64) {
  const { b, trak, scale } = T, cp = x => b.slice(x.start, x.end);
  const mdia = need(child(b, trak, "mdia"), "mdia"), minf = need(child(b, mdia, "minf"), "minf"), stbl = need(child(b, minf, "stbl"), "stbl");
  const stsd = need(child(b, stbl, "stsd"), "stsd");

  const mt = T.origMT > 0 ? T.origMT : Math.max(0, T.samples[0].cts);
  const shownMedia = T.origMT > 0 ? Math.max(0, T.mediaDur - mt) : T.mediaDur;   // desfase por B-frames: la línea de tiempo dura lo mismo
  const trackDur = Math.round(shownMedia * movScale / scale);

  const tkhd = cp(need(child(b, trak, "tkhd"), "tkhd")), tv = tkhd[8];
  dv(tkhd).setUint32(8 + 4 + (tv === 1 ? 16 : 8), id);
  patchDuration(tkhd, tv, 28, 36, trackDur);

  const mdhd = cp(need(child(b, mdia, "mdhd"), "mdhd")), mv = mdhd[8];
  patchDuration(mdhd, mv, 8 + 16, 8 + 24, T.mediaDur);

  const newStbl = box("stbl", cp(stsd), ...sampleTables(T, chunkOffsets, co64));
  const minfKids = [...boxes(b, minf.body, minf.end)].map(x => x.type === "stbl" ? newStbl : cp(x));
  const mdiaKids = [...boxes(b, mdia.body, mdia.end)].map(x => x.type === "mdhd" ? mdhd : x.type === "minf" ? box("minf", ...minfKids) : cp(x));
  const kids = [tkhd];
  if (mt > 0) kids.push(box("edts", fullBox("elst", 0, 0, u32s([1, Math.round(shownMedia * movScale / scale), mt, 0x00010000]))));
  kids.push(box("mdia", ...mdiaKids));
  return { bytes: box("trak", ...kids), dur: trackDur };
}

function makeMoov(V, A, offs, co64) {
  const mvhdBox = need(child(V.b, V.moov, "mvhd"), "mvhd"), mvhd = V.b.slice(mvhdBox.start, mvhdBox.end), mver = mvhd[8];
  const movScale = dv(mvhd).getUint32(8 + (mver === 1 ? 20 : 12)) || 1000;
  const tv = makeTrak(V, 1, movScale, offs.v, co64), ta = makeTrak(A, 2, movScale, offs.a, co64);
  patchDuration(mvhd, mver, 8 + 16, 8 + 24, Math.max(tv.dur, ta.dur));
  dv(mvhd).setUint32(mvhd.length - 4, 3);               // next_track_ID
  return box("moov", mvhd, tv.bytes, ta.bytes);
}

export function muxMp4(videoBuf, audioBuf) {
  const V = readSource(videoBuf, "vídeo"), A = readSource(audioBuf, "audio");

  // orden de los trozos en el mdat: intercalados por tiempo (a igualdad, vídeo primero)
  const order = [...V.chunks.map(c => ({ c, S: V, id: 1 })), ...A.chunks.map(c => ({ c, S: A, id: 2 }))]
    .sort((x, y) => x.c.t - y.c.t || x.id - y.id);
  let rel = 0; for (const o of order) { o.c.rel = rel; rel += o.c.len; }
  const mdatBody = rel, big = mdatBody + 8 > 0xffffffff, co64 = mdatBody > 0xffff0000;

  const brands = ["isom", "iso2", "mp41"], stsd = child(V.b, child(V.b, child(V.b, child(V.b, V.trak, "mdia"), "minf"), "stbl"), "stsd");
  const vc = stsd ? type4(V.b, stsd.body + 12) : "";
  if (vc === "avc1" || vc === "avc3") brands.splice(2, 0, "avc1"); else if (vc === "av01") brands.splice(2, 0, "av01");
  const ftyp = box("ftyp", str4("isom"), u32s([512]), ...brands.map(str4));

  const offsetsAt = base => ({ v: V.chunks.map(c => base + c.rel), a: A.chunks.map(c => base + c.rel) });
  const moovLen = makeMoov(V, A, offsetsAt(0), co64).length;       // tamaño fijo: no depende de los valores
  const base = ftyp.length + moovLen + (big ? 16 : 8);
  const moov = makeMoov(V, A, offsetsAt(base), co64);

  const mdatHdr = big ? (() => { const h = new Uint8Array(16), v = dv(h); v.setUint32(0, 1); h.set(str4("mdat"), 4); v.setBigUint64(8, BigInt(mdatBody + 16)); return h; })()
    : (() => { const h = new Uint8Array(8); dv(h).setUint32(0, mdatBody + 8); h.set(str4("mdat"), 4); return h; })();
  return [ftyp, moov, mdatHdr, ...order.map(({ c, S }) => S.b.subarray(c.start, c.start + c.len))];   // new Blob(out, { type: "video/mp4" })
}
