export function liquid(w, root, motionOn) {
  const mc = root.querySelector(".mc"), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let px = w.screenX, py = w.screenY, ox = 0, oy = 0, vx = 0, vy = 0, jx = 0, jy = 0, jvx = 0, jvy = 0, sc = 1, scv = 0, rest = true, raf = 0, ds = [], lastScale = 0;
  let kx = 0, ky = 0, drag = null, pressed = false;
  const lim = () => Math.max(6, (parseFloat(w.getComputedStyle(mc.parentElement).paddingLeft) || 16) - 3);
  const scaleTo = k => {
    if (Math.abs(k - lastScale) < 1) return; lastScale = k;
    if (!ds.length || !ds[0].isConnected) ds = [...w.document.querySelectorAll("#fmg feDisplacementMap")];
    for (const d of ds) d.setAttribute("scale", k.toFixed(1));
  };
  const loop = () => {
    const x = w.screenX, y = w.screenY;
    let dx = drag ? 0 : clamp(x - px, -70, 70), dy = drag ? 0 : clamp(y - py, -70, 70); px = x; py = y;
    dx += kx; dy += ky; kx = ky = 0; dx = clamp(dx, -70, 70); dy = clamp(dy, -70, 70);
    const L = lim();
    vx -= dx * .55; vy -= dy * .55;
    vx -= ox * .13; vy -= oy * .13; vx *= .86; vy *= .86; ox += vx; oy += vy;
    if (Math.abs(ox) > L) { ox = Math.sign(ox) * L; vx *= -.45; }
    if (Math.abs(oy) > L) { oy = Math.sign(oy) * L; vy *= -.45; }
    jvx += (ox - jx) * .07; jvy += (oy - jy) * .07; jvx *= .88; jvy *= .88; jx += jvx; jy += jvy;
    scv += ((pressed ? .955 : 1) - sc) * .2; scv *= .72; sc += scv;
    const sp = Math.hypot(vx, vy), still = sp < .03 && Math.hypot(ox, oy) < .06 && !dx && !dy && Math.abs(sc - 1) < .0006 && Math.abs(scv) < .0006;
    if (!still || !rest) {
      if (still) { ox = oy = vx = vy = jx = jy = jvx = jvy = 0; sc = 1; scv = 0; mc.style.transform = ""; mc.style.setProperty("--lx", 0); mc.style.setProperty("--ly", 0); mc.style.setProperty("--spd", 0); scaleTo(38); }
      else if (motionOn()) {
        const a = Math.atan2(vy, vx), s = Math.min(.11, sp * .013);
        mc.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px) rotate(${a.toFixed(3)}rad) scale(${((1 + s) * sc).toFixed(4)},${((1 - s * .75) * sc).toFixed(4)}) rotate(${(-a).toFixed(3)}rad)`;
        mc.style.setProperty("--lx", ((jx - ox) * .7).toFixed(2)); mc.style.setProperty("--ly", ((jy - oy) * .7).toFixed(2));
        mc.style.setProperty("--spd", Math.min(1, sp / 10 + (1 - sc) * 4).toFixed(2));
        scaleTo(38 + Math.min(34, sp * 5 + (1 - sc) * 400));
      }
    }
    rest = still; raf = w.requestAnimationFrame(loop);
  };
  const down = e => {
    if (e.button || e.target.closest("button,canvas,input,select,a")) return;
    drag = { ex: e.screenX, ey: e.screenY, wx: w.screenX, wy: w.screenY, lx: e.screenX, ly: e.screenY, ok: true };
    pressed = true; mc.setPointerCapture?.(e.pointerId); mc.classList.add("grab");
  };
  const move = e => {
    if (!drag) { kx += (e.movementX || 0) * .05; ky += (e.movementY || 0) * .05; return; }
    const ddx = e.screenX - drag.lx, ddy = e.screenY - drag.ly; drag.lx = e.screenX; drag.ly = e.screenY;
    if (drag.ok) { try { w.moveTo(drag.wx + e.screenX - drag.ex, drag.wy + e.screenY - drag.ey); kx += ddx; ky += ddy; } catch { drag.ok = false; } }
    if (!drag.ok) { kx -= ddx * .6; ky -= ddy * .6; }
  };
  const up = () => { if (!drag) return; drag = null; pressed = false; mc.classList.remove("grab"); };
  mc.addEventListener("pointerdown", down); mc.addEventListener("pointermove", move);
  mc.addEventListener("pointerup", up); mc.addEventListener("pointercancel", up);
  raf = w.requestAnimationFrame(loop);
  return () => w.cancelAnimationFrame(raf);
}
