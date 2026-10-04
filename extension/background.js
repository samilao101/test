import { mediaControl } from "./media.js";

// Holds a WebSocket to the relay. Since Chrome 116, WebSocket traffic keeps an
// MV3 service worker alive, so we ping more often than the 30s idle timeout.
// The alarm reconnects if Chrome stopped the worker anyway.

const KEEPALIVE_MS = 20_000;
const MAX_BACKOFF_MS = 60_000;

let ws = null;
let keepaliveTimer = null;
let reconnectTimer = null;
let backoff = 1_000;
let statusTimer = null;

// ---------- connection ----------

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);

  const { relayUrl, token } = await chrome.storage.local.get(["relayUrl", "token"]);
  if (!relayUrl || !token) {
    setConnection("not configured");
    return;
  }

  let url;
  try {
    url = socketUrl(relayUrl, token);
  } catch {
    setConnection("invalid relay URL");
    return;
  }

  setConnection("connecting");
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    backoff = 1_000;
    setConnection("connected");
    clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => send({ type: "ping" }), KEEPALIVE_MS);
    reportStatus();
  };

  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "command") {
      await runCommand(msg.action);
      scheduleStatus(400);
    }
  };

  socket.onclose = () => {
    if (ws !== socket) return; // Replaced by a newer connection.
    ws = null;
    clearInterval(keepaliveTimer);
    setConnection("disconnected");
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };
}

function reconnect() {
  const old = ws;
  ws = null;
  clearInterval(keepaliveTimer);
  old?.close();
  backoff = 1_000;
  connect();
}

function socketUrl(relayUrl, token) {
  const u = new URL(relayUrl);
  u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
  u.pathname = u.pathname.replace(/\/+$/, "") + "/ws";
  u.searchParams.set("token", token);
  return u.toString();
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function setConnection(state) {
  await chrome.storage.session.set({ connection: state });
  const ok = state === "connected";
  await chrome.action.setBadgeText({ text: ok ? "" : "off" });
  await chrome.action.setBadgeBackgroundColor({ color: "#b3261e" });
}

// ---------- media control ----------

async function mediaTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => !t.discarded && /^(https?|file):/.test(t.url || ""));
}

async function inject(tabId, action) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: mediaControl,
      args: [action],
    });
    return frames.reduce(
      (acc, f) => ({
        count: acc.count + (f.result?.count ?? 0),
        resumable: acc.resumable + (f.result?.resumable ?? 0),
      }),
      { count: 0, resumable: 0 },
    );
  } catch {
    // Restricted page (Chrome Web Store, etc.) or tab closed mid-call.
    return { count: 0, resumable: 0 };
  }
}

async function forAllTabs(action) {
  const tabs = await mediaTabs();
  const results = await Promise.all(tabs.map((t) => inject(t.id, action)));
  return tabs.map((tab, i) => ({ tab, ...results[i] }));
}

async function pauseAll() {
  const results = await forAllTabs("pause");
  return results.reduce((n, r) => n + r.count, 0);
}

async function resumeAll() {
  const results = await forAllTabs("resume");
  const resumed = results.reduce((n, r) => n + r.count, 0);
  if (resumed > 0) return resumed;

  // Nothing paused by us: resume the tab that most recently made sound.
  const { lastPlayingTabId } = await chrome.storage.session.get("lastPlayingTabId");
  if (lastPlayingTabId == null) return 0;
  return (await inject(lastPlayingTabId, "playAny")).count;
}

async function runCommand(action) {
  if (action === "pause") return pauseAll();
  if (action === "play") return resumeAll();
  if (action === "toggle") {
    const paused = await pauseAll();
    return paused > 0 ? paused : resumeAll();
  }
}

// ---------- status reporting ----------

async function collectStatus() {
  const results = await forAllTabs("query");
  const playingTabs = results
    .filter((r) => r.count > 0)
    .map((r) => ({ id: r.tab.id, title: r.tab.title || "", url: r.tab.url || "" }));
  if (playingTabs.length) await chrome.storage.session.set({ lastPlayingTabId: playingTabs[0].id });
  return {
    playing: playingTabs.length > 0,
    tabs: playingTabs.map(({ title, url }) => ({ title, url })),
    resumable: results.reduce((n, r) => n + r.resumable, 0),
  };
}

async function reportStatus() {
  if (ws?.readyState !== WebSocket.OPEN) return;
  send({ type: "status", state: await collectStatus() });
}

function scheduleStatus(delay = 600) {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(reportStatus, delay);
}

// ---------- events ----------

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.audible === true) chrome.storage.session.set({ lastPlayingTabId: tabId });
  if ("audible" in change || change.status === "complete") scheduleStatus();
});
chrome.tabs.onRemoved.addListener(() => scheduleStatus());

chrome.action.onClicked.addListener(async () => {
  await runCommand("toggle");
  scheduleStatus(400);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.relayUrl || changes.token)) reconnect();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { relayUrl, token } = await chrome.storage.local.get(["relayUrl", "token"]);
  if (reason === "install" && (!relayUrl || !token)) chrome.runtime.openOptionsPage();
});

chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") connect();
});

chrome.runtime.onStartup.addListener(connect);
connect();
