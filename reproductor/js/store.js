const load = (k, d) => { try { return JSON.parse(localStorage.getItem("fm." + k)) ?? d; } catch { return d; } };

export const DEF = {

  customColor: "#ff5fa2", font: "inter", fs: 100, radius: "normal", density: "normal", motion: true,

  ambient: true, ambInt: 26, fbg: "mesh", fanim: true,

  wave: "wavy", playShape: "morph", m3: 1,

  cardSize: "medium", histMax: 30, home: { recent: true, feed: true, again: true, mixes: true, likes: true, artist: true, top: true },

  fdesign: "classic", fpanel: "lyrics", video: true, idle: 3, lySize: 100, lyAlign: "left", lyBlur: true, sweep: true, lyBeat: true, lyTr: "off",

  miniDesign: "glass", miniSize: "medium", miniLyric: true, miniAuto: false,

  autonext: true, stats: true, volume: .8,
};
const loadCfg = () => { const c = load("cfg", {}); if (c && typeof c === "object" && !c.m3) { c.m3 = 1; c.playShape = "morph"; } return c; };
export const mergeCfg = c => ({ ...DEF, ...(c && typeof c === "object" ? c : {}), home: { ...DEF.home, ...(c?.home || {}) } });

export const S = { likes: load("likes", []), history: load("history", []), plays: load("plays", {}), recent: [].concat(load("recent", [])).filter(x => typeof x === "string").slice(0, 8), accent: load("accent", "rose"), theme: load("theme", "dark"), rail: load("rail", true), cfg: mergeCfg(loadCfg()) };
export const save = k => { try { localStorage.setItem("fm." + k, JSON.stringify(S[k])); } catch {} };
export const isLiked = id => S.likes.some(s => s.id === id);
export const toggleLike = s => { S.likes = isLiked(s.id) ? S.likes.filter(x => x.id !== s.id) : [s, ...S.likes]; save("likes"); };

export const pushRecent = q => { q = q.trim(); if (!q) return; S.recent = [q, ...S.recent.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8); save("recent"); };
export const artistNames = a => String(a || "").split(/\s*(?:,|&|\sy\s|\sx\s|\sfeat\.?\s|\sft\.?\s|\swith\s|\scon\s)\s*/i).map(x => x.trim()).filter(Boolean);
export const countPlay = s => { for (const n of new Set(artistNames(s.artist))) S.plays[n] = (S.plays[n] || 0) + 1; save("plays"); };
export function topArtist() {
  let counts = S.plays;
  if (!Object.keys(counts).length) { counts = {}; for (const s of [...S.history, ...S.likes]) for (const n of new Set(artistNames(s.artist))) counts[n] = (counts[n] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : "";
}
export const pushHistory = s => { S.history = [s, ...S.history.filter(x => x.id !== s.id)].slice(0, S.cfg.histMax); save("history"); };

export const FONTS = {
  inter: ["Inter", "Inter, system-ui, sans-serif"],
  poppins: ["Poppins", "Poppins, system-ui, sans-serif"],
  grotesk: ["Space Grotesk", "'Space Grotesk', system-ui, sans-serif"],
  lora: ["Lora (serif)", "Lora, Georgia, serif"],
  mono: ["JetBrains Mono", "'JetBrains Mono', ui-monospace, Consolas, monospace"],
  system: ["Sistema", "system-ui, -apple-system, 'Segoe UI', sans-serif"],
};
const RK = { sharp: 0, soft: .5, normal: 1, round: 1.5 }, CK = { small: .8, medium: 1, large: 1.25 };

export const dyn = { color: null };

const toHsl = hex => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return [h, s, l];
};
const hsl = (h, s, l) => `hsl(${Math.round(h)},${Math.round(Math.min(1, s) * 100)}%,${Math.round(l * 100)}%)`;
export function palette(hex, theme, boost) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) hex = "#ff5fa2";
  let [h, s] = toHsl(hex); if (boost) s = Math.min(1, Math.max(.4, s * 1.1));
  return theme === "dark"
    ? { "--p": hsl(h, s, .8), "--on-p": hsl(h, Math.min(s, .6), .15), "--c": hsl(h, Math.min(s, .5), .28), "--on-c": hsl(h, Math.min(s, .9), .9) }
    : { "--p": hsl(h, s, .38), "--on-p": "#fff", "--c": hsl(h, Math.min(s, .9), .9), "--on-c": hsl(h, Math.min(s, .6), .15) };
}

const dark = matchMedia("(prefers-color-scheme: dark)");
export const effectiveTheme = () => S.theme === "auto" ? (dark.matches ? "dark" : "light") : S.theme;
export function applyTheme() {
  const d = document.documentElement, st = d.style, c = S.cfg, theme = effectiveTheme();
  d.dataset.theme = theme; d.dataset.accent = S.accent;
  const custom = S.accent === "custom" ? c.customColor : S.accent === "cover" ? (dyn.color || "#ffb0d0") : null;
  for (const k of ["--p", "--on-p", "--c", "--on-c"]) st.removeProperty(k);
  if (custom) for (const [k, v] of Object.entries(palette(custom, theme, S.accent === "cover"))) st.setProperty(k, v);
  st.setProperty("--font", (FONTS[c.font] || FONTS.inter)[1]);
  st.setProperty("--fs", c.fs / 100); st.setProperty("--rk", RK[c.radius] ?? 1); st.setProperty("--ck", CK[c.cardSize] ?? 1);
  st.setProperty("--ly-k", c.lySize / 100); st.setProperty("--amb-mix", (c.ambient ? c.ambInt : 0) + "%");
  Object.assign(d.dataset, { density: c.density, playshape: c.playShape, fdesign: c.fdesign, fbg: c.fbg, lyalign: c.lyAlign,
    motion: c.motion ? "on" : "off", fanim: c.fanim ? "on" : "off", lyblur: c.lyBlur ? "on" : "off", sweep: c.sweep ? "on" : "off", lybeat: c.lyBeat ? "on" : "off", lytr: c.lyTr && c.lyTr !== "off" ? "on" : "off" });
}
dark.addEventListener("change", () => S.theme === "auto" && applyTheme());
