// Runs inside each tab (in the extension's isolated world) via chrome.scripting.
// Must stay self-contained: it is serialized and injected, so it can't use imports
// or anything from the enclosing module.
export async function mediaControl(action) {
  // The isolated world's globals persist for the life of the document, so this
  // remembers which elements the remote paused across separate injections.
  const store = (globalThis.__mediaRemote ??= { paused: new Set() });

  const media = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el instanceof HTMLMediaElement) media.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);

  const audible = (m) => !m.muted && m.volume > 0;
  const playing = (m) => !m.paused && !m.ended && audible(m);
  const tryPlay = async (m) => {
    try {
      await m.play();
      return true;
    } catch {
      return false;
    }
  };

  if (action === "pause") {
    let count = 0;
    for (const m of media.filter(playing)) {
      m.pause();
      store.paused.add(m);
      count++;
    }
    return { count };
  }

  if (action === "resume") {
    const targets = [...store.paused].filter((m) => m.isConnected && m.paused);
    store.paused.clear();
    const results = await Promise.all(targets.map(tryPlay));
    return { count: results.filter(Boolean).length };
  }

  if (action === "playAny") {
    // Fallback when the remote didn't pause anything itself (e.g. you paused by
    // hand): start whatever looks like the main player on this page.
    const candidate = media
      .filter((m) => m.paused && !m.ended && audible(m))
      .sort((a, b) => (b.currentTime > 0) - (a.currentTime > 0) || area(b) - area(a))[0];
    return { count: candidate && (await tryPlay(candidate)) ? 1 : 0 };
  }

  // "query"
  const resumable = [...store.paused].filter((m) => m.isConnected && m.paused).length;
  return { count: media.filter(playing).length, resumable };

  function area(m) {
    const r = m.getBoundingClientRect();
    return r.width * r.height;
  }
}
