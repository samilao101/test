// End-to-end: real Chromium + this extension + a running relay (`npm run dev` in relay/).
//   cd extension/test && npm install && npm test
import { chromium } from "playwright";
import http from "node:http";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// 20s 440Hz WAV
function wav(sec = 20, rate = 8000) {
  const n = sec * rate, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return buf;
}
const tone = wav();
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/tone.wav")) { res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(tone); }
  res.writeHead(200, { "Content-Type": "text/html" });
  if (req.url === "/a") res.end(`<title>Tab A</title><audio id=m src="/tone.wav" autoplay loop></audio>`);
  else if (req.url === "/b") res.end(`<title>Tab B</title><div id=host></div><script>
    const r = host.attachShadow({mode:"open"}); r.innerHTML='<video id=m src="/tone.wav" autoplay loop></video>';
    window.m = r.getElementById("m");</script>`);
  else res.end(`<title>Muted</title><video id=m src="/tone.wav" autoplay loop muted></video>`);
}).listen(9123);

const RELAY = process.env.RELAY_URL || "http://localhost:8787";
const TOKEN = process.env.AUTH_TOKEN || "dev-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const cmd = (action) => fetch(`${RELAY}/command`, { method: "POST", headers: auth, body: JSON.stringify({ action }) }).then(r => r.json());
const status = () => fetch(`${RELAY}/status`, { headers: auth }).then(r => r.json());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ext = fileURLToPath(new URL("..", import.meta.url));
const ctx = await chromium.launchPersistentContext("", {
  headless: true, channel: "chromium",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--autoplay-policy=no-user-gesture-required"],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const opts = await ctx.newPage(); await opts.goto(`chrome-extension://${id}/options.html`);
await opts.fill("#relayUrl", RELAY); await opts.fill("#token", TOKEN); await opts.click("button");
await opts.waitForFunction(() => document.getElementById("connection").textContent === "connected", null, { timeout: 10000 });
console.log("options page shows connected");

const a = await ctx.newPage(); await a.goto("http://localhost:9123/a");
const b = await ctx.newPage(); await b.goto("http://localhost:9123/b");
const c = await ctx.newPage(); await c.goto("http://localhost:9123/c");
const paused = (p) => p.evaluate(() => window.m.paused);
await sleep(1500);
assert.deepEqual([await paused(a), await paused(b), await paused(c)], [false, false, false]);

for (let i = 0; i < 50 && (await status()).connected < 1; i++) await sleep(200);
let s = await status(); console.log("initial status", JSON.stringify(s));
assert.equal(s.connected, 1);

console.log("toggle ->", await cmd("toggle")); await sleep(1000);
assert.deepEqual([await paused(a), await paused(b), await paused(c)], [true, true, false], "pause hits audible media incl. shadow DOM, skips muted");
s = await status(); console.log("after pause", JSON.stringify(s.state)); assert.equal(s.state.playing, false); assert.equal(s.state.resumable, 2);

console.log("toggle ->", await cmd("toggle")); await sleep(1000);
assert.deepEqual([await paused(a), await paused(b)], [false, false], "resume only what we paused");
s = await status(); console.log("after resume", JSON.stringify(s.state)); assert.equal(s.state.playing, true); assert.equal(s.state.tabs.length, 2);

// User pauses by hand; play should fall back to the last audible tab.
await cmd("pause"); await sleep(500); await cmd("play"); await sleep(800);
await a.evaluate(() => m.pause()); await b.evaluate(() => m.pause()); await sleep(300);
console.log("play (fallback) ->", await cmd("play")); await sleep(1000);
assert.ok(!(await paused(a)) || !(await paused(b)), "fallback resumes last playing tab");

await ctx.close(); server.close();
console.log("E2E PASSED");
