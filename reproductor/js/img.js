

const SIZES = [60, 120, 226, 544, 1200];
const RESIZABLE = /googleusercontent\.com|ggpht\.com/;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const YTIMG = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;
export const hq = (url, px = 544) => {

  const v = YTIMG.exec(url || ""); if (v) return `https://i.ytimg.com/vi/${v[1]}/maxresdefault.jpg`;
  if (!url || !RESIZABLE.test(url)) return url || "";
  const s = SIZES.find(v => v >= px) ?? SIZES.at(-1);
  const base = url.replace(/=(?:w\d+-h\d+|s\d+)(?:-[^?]*)?$/, "");
  return `${base === url ? url.replace(/=[^/=]*$/, "") : base}=w${s}-h${s}-l90-rj`;
};
export function bindCoverFallback(img, videoId, original = "") {
  if (!img || !videoId) return;
  const backup = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  img.onerror = () => {
    const current = img.currentSrc || img.src;
    if (original && current !== new URL(original, location.href).href) img.src = original;
    else { img.onerror = null; img.src = backup; }
  };
}

const SHARP = () => Math.min(3, Math.max(2, devicePixelRatio || 1));
export const hqPx = (url, px) => hq(url, px * SHARP());

const mid = url => { const v = YTIMG.exec(url || ""); return v ? `https://i.ytimg.com/vi/${v[1]}/sddefault.jpg` : ""; };
export const pic = (url, px, extra = "") => `<img src="${esc(hqPx(url, px))}" data-o="${esc(url)}" data-m="${esc(mid(url))}" onerror="if(this.dataset.m&&this.src!==this.dataset.m&&this.src!==this.dataset.o){this.src=this.dataset.m}else{this.onerror=null;this.src=this.dataset.o}" onload="if(this.naturalWidth<=120&&this.src!==this.dataset.o){this.onload=null;this.src=this.dataset.o}" alt="" decoding="async" ${extra}>`;
