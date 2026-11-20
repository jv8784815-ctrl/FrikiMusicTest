import { au, P } from "./player.js";
import { S } from "./store.js";
import { isNative } from "./native.js";

const API = isNative ? "https://frikimusic.org" : "";
const cid = () => {
  try {
    let v = localStorage.getItem("fm.cid");
    if (!v) { v = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("fm.cid", v); }
    return v;
  } catch { return ""; }
};
let sent = "";
au.addEventListener("timeupdate", () => {
  const s = P.song;
  if (!s || !S.cfg.stats || au.currentTime < 30 || sent === s.id) return;
  const id = cid();
  if (!id) return;
  sent = s.id;
  fetch(API + "/api/play", { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ id: s.id, title: s.title, artist: s.artist, cover: s.cover, cid: id }), keepalive: true }).catch(() => {});
});

export async function fetchTop(period, scope) {
  const r = await fetch(`${API}/api/top?period=${period}&scope=${scope}`);
  if (!r.ok) throw new Error("top " + r.status);
  return r.json();
}
