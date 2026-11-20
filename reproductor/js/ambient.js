

import { hq } from "./img.js";
import { S, dyn, applyTheme } from "./store.js";
let last = "";
const vivid = (r, g, b) => { const a = (r + g + b) / 3, k = 1.45, f = v => Math.max(0, Math.min(255, a + (v - a) * k) | 0); return `rgb(${f(r)},${f(g)},${f(b)})`; };
export function ambient(url) {
  if (!url || url === last) return; last = url;
  const img = new Image(); img.crossOrigin = "anonymous";
  img.onload = () => {
    const root = document.documentElement.style;
    try {
      const N = 16, c = document.createElement("canvas"); c.width = c.height = N;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, N, N);
      const d = x.getImageData(0, 0, N, N).data, q = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      for (let i = 0; i < d.length; i += 4) {
        const p = i / 4, k = (p % N >= N / 2 ? 1 : 0) + (p / N >= N / 2 ? 2 : 0);
        q[k][0] += d[i]; q[k][1] += d[i + 1]; q[k][2] += d[i + 2]; q[k][3]++;
      }
      const t = [0, 0, 0]; let best = null, bs = -1;
      q.forEach(([r, g, b, n], k) => { root.setProperty(`--m${k + 1}`, vivid(r / n, g / n, b / n)); t[0] += r / n; t[1] += g / n; t[2] += b / n;
        const R = r / n, G = g / n, B = b / n, mx = Math.max(R, G, B), sat = mx ? (mx - Math.min(R, G, B)) / mx : 0;
        if (sat > bs) { bs = sat; best = [R, G, B]; } });
      dyn.color = "#" + best.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
      if (S.accent === "cover") applyTheme();
      root.setProperty("--amb", `rgb(${t[0] / 4 | 0},${t[1] / 4 | 0},${t[2] / 4 | 0})`);
    } catch { ["--amb", "--m1", "--m2", "--m3", "--m4"].forEach(k => root.removeProperty(k)); }
  };
  img.src = hq(url, 60);
}
export const coverColor = url => new Promise(ok => {
  if (!url) return ok(null);
  const img = new Image(); img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const N = 12, c = document.createElement("canvas"); c.width = c.height = N;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0, N, N);
      const d = x.getImageData(0, 0, N, N).data; let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), k = 1 + (mx - mn) / 32; r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k; }
      ok(`rgb(${r / w | 0},${g / w | 0},${b / w | 0})`);
    } catch { ok(null); }
  };
  img.onerror = () => ok(null);
  img.src = hq(url, 60);
});
