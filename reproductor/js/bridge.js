// ID fijo de la extensión (campo "key" del manifest.json)
export const EXT = "ejodfoofmpcpikknldogdcpfipmkbmhn";
import { isNative, nativeBridge } from "./native.js";
export const bridge = (method, params) => isNative ? nativeBridge(method, params) : new Promise((ok, no) => {
  if (!globalThis.chrome?.runtime?.sendMessage) return no(Error("Abre la web en Chrome o Edge con la extensión instalada"));
  chrome.runtime.sendMessage(EXT, { channel: "friki-bridge", method, params }, r => {
    if (chrome.runtime.lastError) return no(Error("No encuentro la extensión FrikiMusic Bridge"));
    r?.ok ? ok(r.result) : no(Error(r?.error || "Error desconocido"));
  });
});
