// Smoke test against a running relay (local `npm run dev` or a deployed worker).
//   RELAY_URL=http://localhost:8787 AUTH_TOKEN=dev-token npm test
import assert from "node:assert/strict";

const base = (process.env.RELAY_URL || "http://localhost:8787").replace(/\/+$/, "");
const token = process.env.AUTH_TOKEN || "dev-token";
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const post = (action, headers = auth) =>
  fetch(`${base}/command`, { method: "POST", headers, body: JSON.stringify({ action }) });

// Auth is enforced.
assert.equal((await fetch(`${base}/status`)).status, 401);
assert.equal((await post("toggle", { "Content-Type": "application/json" })).status, 401);
assert.equal((await post("explode")).status, 400);

// Fake extension connects.
const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
const messages = [];
ws.onmessage = (e) => messages.push(JSON.parse(e.data));
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

// Keepalive is answered.
ws.send(JSON.stringify({ type: "ping" }));
await waitFor(() => messages.some((m) => m.type === "pong"));

// Commands reach the extension.
const res = await post("toggle");
assert.equal(res.status, 200);
assert.equal((await res.json()).delivered, 1);
await waitFor(() => messages.some((m) => m.type === "command" && m.action === "toggle"));

// Status reported by the extension is readable by the app.
ws.send(JSON.stringify({ type: "status", state: { playing: true, tabs: [{ title: "Song", url: "https://x" }], resumable: 0 } }));
await waitFor(async () => {
  const s = await (await fetch(`${base}/status`, { headers: auth })).json();
  return s.connected === 1 && s.state?.playing === true && s.state.tabs[0].title === "Song";
});

// With no browser connected, commands report 503.
ws.close();
await waitFor(async () => (await post("pause")).status === 503);

console.log("relay smoke test passed");

async function waitFor(check, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for condition");
}
