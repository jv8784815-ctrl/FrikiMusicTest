
import { au, seekTo } from "./player.js";
import { S } from "./store.js";
export function wavy(canvas) {
  const win = canvas.ownerDocument.defaultView, ctx = canvas.getContext("2d"); let amp = 0, phase = 0, drag = false, raf;
  const frac = () => au.duration ? au.currentTime / au.duration : 0;
  function draw() {
    const dpr = win.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return (raf = win.requestAnimationFrame(draw));
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const cs = win.getComputedStyle(canvas), p = cs.getPropertyValue("--p"), track = cs.getPropertyValue("--olv");
    amp += ((!au.paused && !drag && S.cfg.wave === "wavy" && S.cfg.motion ? 3.5 : 0) - amp) * .1; phase += .08;
    const x = frac() * (w - 6) + 3, cy = h / 2; ctx.lineCap = "round"; ctx.lineWidth = 4;
    ctx.strokeStyle = track; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(w - 3, cy); ctx.stroke();
    ctx.strokeStyle = p; ctx.beginPath();
    for (let i = 3; i <= x; i += 2) { const y = cy + amp * Math.sin(i / 11 - phase); i === 3 ? ctx.moveTo(i, y) : ctx.lineTo(i, y); }
    ctx.stroke(); ctx.fillStyle = p; ctx.beginPath(); ctx.roundRect(x - 2.5, cy - 11, 5, 22, 3); ctx.fill();
    raf = win.requestAnimationFrame(draw);
  }
  const at = e => { const r = canvas.getBoundingClientRect(); seekTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); };
  canvas.onpointerdown = e => { drag = true; canvas.setPointerCapture(e.pointerId); at(e); };
  canvas.onpointermove = e => drag && at(e);
  canvas.onpointerup = () => drag = false;
  draw();
  return () => win.cancelAnimationFrame(raf);
}
