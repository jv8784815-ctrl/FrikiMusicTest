// Une un MP4 fragmentado de vídeo y otro de audio (los DASH de YouTube vienen separados) en un solo MP4
// fragmentado, sin recodificar ni librerías. Pistas: vídeo = 1, audio = 2. Los fragmentos (moof+mdat) se
// intercalan por tiempo. Solo sirve para MP4 (H.264/AV1 + AAC); WebM necesitaría otro contenedor.

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
const child = (b, box, name) => { for (const c of boxes(b, box.body, box.end)) if (c.type === name) return c; return null; };
const need = (x, what) => { if (!x) throw new Error("MP4 sin " + what); return x; };
const dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength);

function box(name, ...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(8 + len);
  const v = new DataView(out.buffer); v.setUint32(0, 8 + len);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  let o = 8; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Lee un MP4 fragmentado: init (ftyp/moov) + fragmentos [{t, moof, mdat}] (t en segundos)
function split(buf, label) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let ftyp = null, moov = null; const frags = []; let pending = null;
  for (const bx of boxes(b)) {
    if (bx.type === "ftyp") ftyp = bx;
    else if (bx.type === "moov") moov = bx;
    else if (bx.type === "moof") pending = bx;
    else if (bx.type === "mdat" && pending) { frags.push({ moof: pending, mdat: bx }); pending = null; }
  }
  need(moov, `moov en el ${label}`);
  if (!frags.length) throw new Error(`El ${label} no es un MP4 fragmentado`);
  const traks = [...boxes(b, moov.body, moov.end)].filter(x => x.type === "trak");
  if (traks.length !== 1) throw new Error(`El ${label} tiene ${traks.length} pistas (se esperaba 1)`);
  const mdhd = need(child(b, need(child(b, traks[0], "mdia"), "mdia"), "mdhd"), "mdhd");
  const ver = b[mdhd.body], scale = dv(b).getUint32(mdhd.body + (ver === 1 ? 20 : 12));
  if (!scale) throw new Error("timescale 0");
  for (const f of frags) {
    const traf = need(child(b, f.moof, "traf"), "traf"), tfdt = child(b, traf, "tfdt");
    if (!tfdt) throw new Error("fragmento sin tfdt");
    const v = dv(b), tv = b[tfdt.body];
    f.t = (tv === 1 ? Number(v.getBigUint64(tfdt.body + 4)) : v.getUint32(tfdt.body + 4)) / scale;
    f.traf = traf;
  }
  return { b, ftyp, moov, trak: traks[0], frags };
}

export function muxMp4(videoBuf, audioBuf) {
  const V = split(videoBuf, "vídeo"), A = split(audioBuf, "audio");
  const out = [], one = (b, x) => b.subarray(x.start, x.end);

  // moov nuevo: mvhd (next_track_ID = 3) + trak vídeo (id 1) + trak audio (id 2) + mvex con dos trex
  const mvhd = need(child(V.b, V.moov, "mvhd"), "mvhd");
  const mvhdCopy = V.b.slice(mvhd.start, mvhd.end); dv(mvhdCopy).setUint32(mvhdCopy.length - 4, 3);

  const retrak = (S, id) => {
    const trak = S.b.slice(S.trak.start, S.trak.end), t = { b: trak, start: 0, hdr: S.trak.hdr, end: trak.length, body: S.trak.hdr };
    const tkhd = need(child(trak, t, "tkhd"), "tkhd");
    dv(trak).setUint32(tkhd.body + (trak[tkhd.body] === 1 ? 20 : 12), id);
    return trak;
  };
  const trexOf = (S, id) => {
    const mvex = need(child(S.b, S.moov, "mvex"), "mvex"), trex = need(child(S.b, mvex, "trex"), "trex");
    const c = S.b.slice(trex.start, trex.end); dv(c).setUint32(trex.hdr + 4, id); return c;
  };
  const moov = box("moov", mvhdCopy, retrak(V, 1), retrak(A, 2), box("mvex", trexOf(V, 1), trexOf(A, 2)));
  out.push(one(V.b, V.ftyp ?? need(null, "ftyp")), moov);

  // fragmentos intercalados por tiempo (a igualdad, vídeo primero)
  const all = [...V.frags.map(f => ({ ...f, S: V, id: 1 })), ...A.frags.map(f => ({ ...f, S: A, id: 2 }))]
    .sort((x, y) => x.t - y.t || x.id - y.id);
  let seq = 1;
  for (const f of all) {
    const b = f.S.b, m = f.moof, v = dv(b);
    const mfhd = need(child(b, m, "mfhd"), "mfhd"); v.setUint32(mfhd.body + 4, seq++);
    const tfhd = need(child(b, f.traf, "tfhd"), "tfhd");
    if (v.getUint32(tfhd.body) & 1) throw new Error("tfhd con base-data-offset: formato no admitido");
    v.setUint32(tfhd.body + 4, f.id);
    out.push(one(b, m), one(b, f.mdat));
  }
  return out;          // trozos Uint8Array: new Blob(out, { type: "video/mp4" })
}
