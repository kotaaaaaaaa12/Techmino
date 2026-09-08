(() => {
  "use strict";

  const intervalMs = 2000;
  let syncing = false;
  let queued = false;

  function runtimeReady() {
    return Boolean(globalThis.Module?.calledRun && globalThis.FS && typeof globalThis.FS.syncfs === "function");
  }

  function flush() {
    if (!runtimeReady()) return;
    if (syncing) {
      queued = true;
      return;
    }

    syncing = true;
    globalThis.FS.syncfs(false, (error) => {
      syncing = false;
      if (error) console.error("Could not persist Techmino save data", error);
      if (queued) {
        queued = false;
        flush();
      }
    });
  }

  globalThis.setInterval(flush, intervalMs);
  globalThis.addEventListener("pagehide", flush);
  globalThis.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
})();
