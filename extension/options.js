const form = document.getElementById("form");
const relayUrl = document.getElementById("relayUrl");
const token = document.getElementById("token");
const connection = document.getElementById("connection");

chrome.storage.local.get(["relayUrl", "token"]).then((cfg) => {
  relayUrl.value = cfg.relayUrl || "";
  token.value = cfg.token || "";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ relayUrl: relayUrl.value.trim(), token: token.value.trim() });
});

function show(state = "…") {
  connection.textContent = state;
  connection.className = state === "connected" ? "connected" : "";
}
chrome.storage.session.get("connection").then((s) => show(s.connection));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.connection) show(changes.connection.newValue);
});
