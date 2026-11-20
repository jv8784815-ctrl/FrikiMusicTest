import { au } from "./player.js";
import { S } from "./store.js";

const N = 180, TAU = Math.PI * 2, SCALE = .96, EVERY = 2800, SPIN = 26;
const sup = n => a => Math.pow(Math.abs(Math.cos(a)) ** n + Math.abs(Math.sin(a)) ** n, -1 / n);
const bump = (k, base, amp) => a => base + amp * Math.cos(k * a);
const SHAPES = {
  squircle: sup(5),
  cookie:   bump(9, .86, .14),
  sunny:    a => .72 + .28 * Math.abs(Math.cos(4 * a)),
  clover:   a => .6 + .4 * Math.abs(Math.cos(2 * a)),
  flower:   bump(6, .78, .22),
  pentagon: bump(5, .87, .13),
  burst:    bump(12, .88, .12),
  circle:   () => 1,
};
const CYCLE = ["cookie", "sunny", "clover", "flower", "pentagon", "burst", "circle"];
const PROFILE = Object.fromEntries(Object.entries(SHAPES).map(([k, f]) => [k, Float32Array.from({ length: N }, (_, i) => f(i / N * TAU) * SCALE)]));

export function playShapes(doc) {
  const win = doc.defaultView, st = new WeakMap(); let raf = 0, last = 0;
  const make = el => {
    const s = { cur: Float32Array.from(PROFILE.squircle), vel: new Float32Array(N), rot: 0, idx: -1, next: 0, was: null, still: false };
    st.set(el, s); return s;
  };

  function frame(now) {
    raf = win.requestAnimationFrame(frame);
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    const on = S.cfg.playShape === "morph", motion = S.cfg.motion, playing = !au.paused;
    for (const el of doc.querySelectorAll(".play")) {
      let s = st.get(el) || make(el);
      if (!on) { if (s.was !== "off") { el.style.clipPath = ""; s.was = "off"; } continue; }
      s.was = "on";

      if (playing) { if (s.idx < 0 || (motion && now >= s.next)) { s.idx = (s.idx + 1) % CYCLE.length; s.next = now + EVERY; } }
      else s.idx = -1;
      const tgt = PROFILE[playing ? CYCLE[Math.max(0, s.idx)] : "squircle"];

      let energy = 0;
      if (!motion) { s.cur.set(tgt); s.vel.fill(0); }
      else {
        const K = 170, D = 9.5;
        for (let i = 0; i < N; i++) { s.vel[i] += (tgt[i] - s.cur[i]) * K * dt; s.vel[i] *= Math.exp(-D * dt); s.cur[i] += s.vel[i] * dt; energy += Math.abs(s.vel[i]) + Math.abs(tgt[i] - s.cur[i]); }
      }

      const rt = playing && motion ? s.rot + SPIN * dt : Math.round(s.rot / 90) * 90;
      const prev = s.rot;
      s.rot = playing && motion ? rt : s.rot + (rt - s.rot) * (1 - Math.exp(-dt * 7));
      const settled = energy < .02 && Math.abs(s.rot - rt) < .05 && !playing;
      if (settled && s.still) continue;
      s.still = settled; if (settled) s.rot = rt;

      const r0 = s.rot * Math.PI / 180, pts = new Array(N);
      for (let i = 0; i < N; i++) {
        const a = i / N * TAU, u = (((a - r0) / TAU) % 1 + 1) % 1 * N, j = Math.floor(u), f = u - j, k = (j + 1) % N;
        const r = s.cur[j % N] * (1 - f) + s.cur[k] * f;
        pts[i] = (50 + 50 * r * Math.cos(a)).toFixed(2) + "% " + (50 + 50 * r * Math.sin(a)).toFixed(2) + "%";
      }
      el.style.clipPath = "polygon(" + pts.join(",") + ")";
    }
  }
  raf = win.requestAnimationFrame(frame);
  return () => { win.cancelAnimationFrame(raf); for (const el of doc.querySelectorAll(".play")) el.style.clipPath = ""; };
}
