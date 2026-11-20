import { bridge } from "./bridge.js";
import { resolveStream } from "./yt.js";
const out = document.getElementById("out");
const log = m => (out.textContent += m + "\n");
const step = async (name, fn) => {
  const t = performance.now();
  try { const r = await fn(); log(`OK   ${name} (${Math.round(performance.now() - t)} ms) ${r ?? ""}`); return true; }
  catch (e) { log(`FALLA ${name}: ${e.message}`); return false; }
};
document.getElementById("go").onclick = async () => {
  out.textContent = `Origen: ${location.origin}\n`;
  await step("extensión responde", async () => JSON.stringify(await bridge("ping")));
  await step("reglas instaladas", async () => JSON.stringify(await bridge("rules")));
  for (const u of ["https://www.youtube.com/sw.js_data", "https://www.youtube.com/iframe_api"])
    await step("GET " + u.replace("https://", ""), async () => { const r = await fetch(u, { credentials: "omit" }); return "HTTP " + r.status; });
  await step("POST music.youtube.com/youtubei/v1/search", async () => {
    const r = await fetch("https://music.youtube.com/youtubei/v1/search?prettyPrint=false", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20260818.08.00" } }, query: "test" }) });
    return "HTTP " + r.status;
  });
  const id = document.getElementById("vid").value.trim() || "dQw4w9WgXcQ";
  await step("resolver audio de " + id, async () => { const s = await resolveStream(id); return `${s.sources.length} fuentes: ` + s.sources.map(x => `itag ${x.itag}${x.muxed ? " (combinado)" : ""}`).join(", "); });
  await step("abrir la primera fuente en <audio>", async () => {
    const s = await resolveStream(id), a = new Audio(); a.muted = true; a.src = await s.sources[0].url();
    await a.play(); a.pause(); return "reproduce";
  });
  log("\nListo.");
};
