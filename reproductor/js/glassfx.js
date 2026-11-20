const uri = s => `data:image/svg+xml,${encodeURIComponent(s)}`;
const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
const stops = (b, a, c) => `<stop offset="0" stop-color="${a}"/><stop offset="${b}" stop-color="${rgb(128, 128, 128)}"/><stop offset="${1 - b}" stop-color="${rgb(128, 128, 128)}"/><stop offset="1" stop-color="${c}"/>`;

function geo(kind, W, H) {
  if (kind === "capsule") return { sig: 1.5, shapes: `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${(H - 2) / 2}"/>`, R: H / 2, y0: 0, h: H, merged: false };
  const R = H / 2, x0 = R * 1.12, h = H * .88, y0 = (H - h) / 2;
  return { sig: H * .075, R, y0, h, merged: true, shapes: `<circle cx="${R}" cy="${R}" r="${R - 1}"/><rect x="${x0}" y="${y0}" width="${W - x0 - 1}" height="${h}" rx="${h / 2}"/>` };
}

function shapeSvg(g, W, H, erode, soft) {
  const post = erode ? `<feMorphology in="b" operator="erode" radius="${erode}" result="e"/><feComposite in="b" in2="e" operator="out"${soft ? ` result="r"/><feGaussianBlur in="r" stdDeviation="${soft}"` : ""}/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><filter id="g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${g.sig}"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 24 -12" result="b"/>${post}</filter><g fill="#000" filter="url(#g)">${g.shapes}</g></svg>`;
}

function dispX(W, H) {
  const b = Math.min(.45, Math.min(34, H * .22) / W);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="a" x1="0" x2="1" y1="0" y2="0">${stops(b, rgb(255, 128, 128), rgb(0, 128, 128))}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#a)"/></svg>`;
}

function dispY(g, W, H) {
  const band = Math.min(34, H * .22), bb = h => Math.min(.45, band / h);
  const grad = (id, h) => `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">${stops(bb(h), rgb(128, 255, 128), rgb(128, 0, 128))}</linearGradient>`;
  if (!g.merged) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${grad("a", H)}</defs><rect width="${W}" height="${H}" fill="url(#a)"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${grad("a", H)}${grad("c", g.h)}</defs><rect width="${W}" height="${H}" fill="${rgb(128, 128, 128)}"/><rect x="0" y="0" width="${g.R * 2}" height="${H}" fill="url(#a)"/><rect x="${g.R}" y="${g.y0}" width="${W - g.R}" height="${g.h}" fill="url(#c)"/></svg>`;
}

export function glassFx(doc, mc, design) {
  let holder = doc.getElementById("fmg-holder");
  if (design !== "glass" && design !== "capsule") {
    holder?.remove();
    for (const k of ["--blob", "--rim", "--rim2"]) mc.style.removeProperty(k);
    return;
  }
  const W = mc.offsetWidth, H = mc.offsetHeight;
  if (W < 40 || H < 40) return;
  const key = design + W + "x" + H;
  if (mc.dataset.fx === key) return;
  mc.dataset.fx = key;
  const g = geo(design, W, H);
  mc.style.setProperty("--blob", `url("${uri(shapeSvg(g, W, H, 0))}")`);
  mc.style.setProperty("--rim", `url("${uri(shapeSvg(g, W, H, 1.6))}")`);
  mc.style.setProperty("--rim2", `url("${uri(shapeSvg(g, W, H, 5, 2.5))}")`);
  if (!holder) { holder = doc.createElement("div"); holder.id = "fmg-holder"; holder.setAttribute("aria-hidden", "true"); holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; doc.body.append(holder); }
  holder.innerHTML = `<svg width="0" height="0"><filter id="fmg" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB">
    <feImage href="${uri(dispX(W, H))}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="mx"/>
    <feDisplacementMap in="SourceGraphic" in2="mx" scale="38" xChannelSelector="R" yChannelSelector="G" result="d1"/>
    <feImage href="${uri(dispY(g, W, H))}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="my"/>
    <feDisplacementMap in="d1" in2="my" scale="38" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;
}
