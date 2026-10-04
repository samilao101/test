import { DurableObject } from "cloudflare:workers";

// Relay between the Chrome extension (holds a WebSocket open) and the iOS app
// (plain HTTPS). One Durable Object instance holds every connection, so a
// command from the app reaches every connected browser.
//
//   GET  /ws?token=...   extension connects here (WebSocket)
//   POST /command        app sends {"action": "toggle" | "pause" | "play"}
//   GET  /status         app reads the last state the extension reported

const ACTIONS = new Set(["toggle", "pause", "play"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/") return json({ ok: true, service: "media-remote-relay" });

    if (!env.AUTH_TOKEN) return json({ error: "AUTH_TOKEN secret is not set on the worker" }, 500);

    // Browsers can't set headers on a WebSocket, so the extension sends the token as a query param.
    const token = url.pathname === "/ws"
      ? url.searchParams.get("token")
      : (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await tokensMatch(token, env.AUTH_TOKEN))) return json({ error: "unauthorized" }, 401);

    const relay = env.RELAY.get(env.RELAY.idFromName("default"));

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected websocket" }, 426);
      return relay.fetch(request);
    }

    if (url.pathname === "/command" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      if (!ACTIONS.has(body?.action)) return json({ error: "action must be toggle, pause or play" }, 400);
      const result = await relay.command(body.action);
      return json(result, result.delivered > 0 ? 200 : 503);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return json(await relay.status());
    }

    return json({ error: "not found" }, 404);
  },
};

export class MediaRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Answered by the runtime without waking the object, so keepalives stay free.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async command(action) {
    const id = crypto.randomUUID();
    const message = JSON.stringify({ type: "command", action, id });
    let delivered = 0;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
        delivered++;
      } catch {
        // Socket is closing; skip it.
      }
    }
    return delivered > 0
      ? { ok: true, id, delivered }
      : { ok: false, id, delivered, error: "no browser connected" };
  }

  async status() {
    const state = (await this.ctx.storage.get("state")) ?? null;
    return { connected: this.ctx.getWebSockets().length, state };
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "status" && msg.state && typeof msg.state === "object") {
      await this.ctx.storage.put("state", { ...msg.state, reportedAt: Date.now() });
    }
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code, "closing");
    } catch {
      // Already closed.
    }
  }
}

async function tokensMatch(given, expected) {
  if (!given) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return response;
}
