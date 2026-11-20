import { au, seekTo } from "./player.js";
import { S } from "./store.js";

const STROKE = 4, AMP = 3, WAVELEN = 40, SPEED = 1, GAP = 6, HANDLE_W = 4, HANDLE_W_DOWN = 2, HANDLE_MAX_H = 44, STOP = 4, STOP_INSET = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t * t * (3 - 2 * t);

export function wavy(canvas) {
  const win = canvas.ownerDocument.defaultView, ctx = canvas.getContext("2d");
  let amp = 0, phase = 0, hw = HANDLE_W, drag = false, dragFrac = 0, raf, last = 0, frame = 0, colP = "#9ECAFF", pid = null;

  canvas.setAttribute("role", "slider"); canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Progreso"); canvas.setAttribute("aria-valuemin", "0");

  const frac = () => (drag || au.seeking) ? dragFrac : au.duration ? clamp(au.currentTime / au.duration, 0, 1) : 0;

  function draw(now) {
    raf = win.requestAnimationFrame(draw);
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    const dpr = win.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    if (frame++ % 30 === 0) colP = win.getComputedStyle(canvas).getPropertyValue("--p").trim() || colP;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);

    const f = frac(), cy = h / 2, r = STROKE / 2;
    const hh = Math.min(HANDLE_MAX_H, h - 2), maxAmp = Math.max(0, Math.min(AMP, cy - r - 1));
    const padL = r, padR = r;
    const x = padL + HANDLE_W / 2 + f * (w - padL - padR - HANDLE_W);

    const wantAmp = !au.paused && !drag && S.cfg.wave === "wavy" && S.cfg.motion ? maxAmp : 0;
    amp += (wantAmp - amp) * (1 - Math.exp(-dt * 9));
    hw += ((drag ? HANDLE_W_DOWN : HANDLE_W) - hw) * (1 - Math.exp(-dt * 20));
    if (S.cfg.wave === "wavy" && S.cfg.motion) phase += dt * SPEED * Math.PI * 2;

    const aStart = padL, aEnd = x - hw / 2 - GAP;
    const iStart = x + hw / 2 + GAP, iEnd = w - padR;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = STROKE;

    if (iEnd - iStart > 0) {
      ctx.globalAlpha = .3; ctx.strokeStyle = colP;
      ctx.beginPath(); ctx.moveTo(iStart, cy); ctx.lineTo(iEnd, cy); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (iEnd - iStart > STOP + STOP_INSET + 6) {
      ctx.fillStyle = colP; ctx.beginPath(); ctx.arc(w - STOP_INSET - STOP / 2 - 1, cy, STOP / 2, 0, Math.PI * 2); ctx.fill();
    }

    if (aEnd > aStart) {
      const len = aEnd - aStart, a = amp * ease(clamp(len / (WAVELEN * .6), 0, 1)), k = Math.PI * 2 / WAVELEN;
      ctx.strokeStyle = colP; ctx.beginPath();
      if (a < .05) { ctx.moveTo(aStart, cy); ctx.lineTo(aEnd, cy); }
      else for (let px = 0; px <= len + .5; px++) { const xx = aStart + Math.min(px, len); const y = cy + a * Math.sin(k * (xx - aStart) - phase); px ? ctx.lineTo(xx, y) : ctx.moveTo(xx, y); }
      ctx.stroke();
    }

    ctx.fillStyle = colP; ctx.beginPath(); ctx.roundRect(x - hw / 2, cy - hh / 2, hw, hh, hw / 2); ctx.fill();

    if (frame % 15 === 0 && au.duration) {
      canvas.setAttribute("aria-valuemax", String(Math.round(au.duration)));
      canvas.setAttribute("aria-valuenow", String(Math.round(au.currentTime)));
    }
  }

  const at = e => { const r = canvas.getBoundingClientRect(), pad = STROKE / 2 + HANDLE_W / 2; dragFrac = clamp((e.clientX - r.left - pad) / (r.width - 2 * pad), 0, 1); seekTo(dragFrac); };
  canvas.onpointerdown = e => { if (e.button) return; drag = true; pid = e.pointerId; canvas.setPointerCapture(pid); at(e); e.preventDefault(); };
  canvas.onpointermove = e => drag && at(e);
  const end = () => { drag = false; pid = null; };
  canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onlostpointercapture = end;
  canvas.onkeydown = e => {
    if (!au.duration) return;
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -5 : 0;
    if (step) { au.currentTime = clamp(au.currentTime + step, 0, au.duration); e.preventDefault(); }
    else if (e.key === "Home") { au.currentTime = 0; e.preventDefault(); }
    else if (e.key === "End") { au.currentTime = au.duration; e.preventDefault(); }
  };

  raf = win.requestAnimationFrame(draw);
  return () => win.cancelAnimationFrame(raf);
}
