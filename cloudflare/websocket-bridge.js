(() => {
  "use strict";

  const serverUrl = globalThis.TECHMINO_SERVER_URL;
  if (!serverUrl) throw new Error("TECHMINO_SERVER_URL is not configured");

  const sockets = new Map();
  const guestNameKey = "techmino.guestName";
  const refreshTokenKey = "techmino.supabaseRefreshToken";
  const memoryStorage = new Map();
  const errorOverlayId = "techmino-multiplayer-error";

  function removeConnectionError() {
    document.getElementById(errorOverlayId)?.remove();
  }

  function showConnectionError(message) {
    removeConnectionError();

    const overlay = document.createElement("div");
    overlay.id = errorOverlayId;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      background: "rgba(0, 0, 0, 0.72)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(560px, 100%)",
      padding: "24px",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      borderRadius: "16px",
      background: "#171717",
      color: "#f5f5f5",
      boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
    });

    const title = document.createElement("div");
    title.textContent = "Multiplayer connection failed";
    Object.assign(title.style, {
      marginBottom: "12px",
      fontSize: "22px",
      fontWeight: "700",
    });

    const description = document.createElement("div");
    description.textContent = "The game returned to the main menu because the online connection could not be established.";
    Object.assign(description.style, {
      marginBottom: "16px",
      color: "#d4d4d4",
      fontSize: "15px",
      lineHeight: "1.5",
    });

    const details = document.createElement("pre");
    details.textContent = String(message || "Unknown connection error");
    Object.assign(details.style, {
      margin: "0 0 20px",
      padding: "14px",
      overflowWrap: "anywhere",
      whiteSpace: "pre-wrap",
      borderRadius: "10px",
      background: "#0a0a0a",
      color: "#fca5a5",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: "13px",
      lineHeight: "1.45",
    });

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    Object.assign(closeButton.style, {
      padding: "10px 16px",
      border: "1px solid #525252",
      borderRadius: "10px",
      background: "transparent",
      color: "#f5f5f5",
      font: "inherit",
      cursor: "pointer",
    });
    closeButton.addEventListener("click", removeConnectionError);

    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "Reload game";
    Object.assign(reloadButton.style, {
      padding: "10px 16px",
      border: "0",
      borderRadius: "10px",
      background: "#7c3aed",
      color: "#ffffff",
      font: "inherit",
      fontWeight: "700",
      cursor: "pointer",
    });
    reloadButton.addEventListener("click", () => globalThis.location.reload());

    actions.append(closeButton, reloadButton);
    panel.append(title, description, details, actions);
    overlay.append(panel);
    document.body.append(overlay);
  }

  function getStoredValue(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) || null;
    }
  }

  function setStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStorage.set(key, value);
    }
  }

  function removeStoredValue(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      memoryStorage.delete(key);
    }
  }

  function defaultGuestName(playerId) {
    return `Guest-${String(playerId).slice(-6)}`;
  }

  function guestName(playerId) {
    let name = getStoredValue(guestNameKey);
    if (!name) {
      name = defaultGuestName(playerId);
      setStoredValue(guestNameKey, name);
    }
    return name.slice(0, 24);
  }

  function addGuestName(player) {
    if (player && typeof player === "object" && player.playerId && !player.username) {
      player.username = defaultGuestName(player.playerId);
    }
  }

  function normalizeServerMessage(message) {
    try {
      const body = JSON.parse(message);
      if ((body.action === 1301 || body.action === 1306) && body.errno === 0 && body.data) {
        if (Array.isArray(body.data.players)) body.data.players.forEach(addGuestName);
        else addGuestName(body.data);
        return JSON.stringify(body);
      }
    } catch {
      // Forward malformed or non-JSON payloads unchanged for the game to handle.
    }
    return message;
  }

  function writeEvent(state, event) {
    if (!state.active) return;
    state.sequence += 1;
    const sequence = String(state.sequence).padStart(8, "0");
    FS.writeFile(`${state.saveDirectory}/__techmino_ws_${state.name}_${sequence}`, JSON.stringify(event));
    FS.writeFile(`${state.saveDirectory}/__techmino_ws_${state.name}_count`, String(state.sequence));
  }

  async function requestSession(refreshToken) {
    return fetch(`${serverUrl}/_worker/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
  }

  async function createSession() {
    const refreshToken = getStoredValue(refreshTokenKey);
    let response = await requestSession(refreshToken);
    if (!response.ok && refreshToken) {
      removeStoredValue(refreshTokenKey);
      response = await requestSession(null);
    }
    if (!response.ok) {
      let reason = `Authentication failed (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body.error === "string" && body.error) reason = body.error;
      } catch {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new Error(reason);
    }
    const session = await response.json();
    setStoredValue(refreshTokenKey, session.refreshToken);
    return session;
  }

  async function connect(name, socketPath, saveDirectory) {
    close(name);
    removeConnectionError();
    const state = {
      name,
      saveDirectory,
      sequence: 0,
      socket: null,
      active: true,
      opened: false,
      manualClose: false,
    };
    FS.writeFile(`${saveDirectory}/__techmino_ws_${name}_count`, "0");
    sockets.set(name, state);

    try {
      const session = await createSession();
      writeEvent(state, {
        type: "message",
        data: JSON.stringify({
          action: 9000,
          errno: 0,
          data: { playerId: session.playerId, username: guestName(session.playerId) },
        }),
      });

      const socketBase = new URL(serverUrl);
      socketBase.protocol = socketBase.protocol === "https:" ? "wss:" : "ws:";
      const url = new URL(socketPath || "/techmino/ws/v1", socketBase);
      url.searchParams.set("access_token", session.accessToken);
      const socket = new WebSocket(url);
      state.socket = socket;
      socket.addEventListener("open", () => {
        state.opened = true;
        writeEvent(state, { type: "open" });
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          writeEvent(state, { type: "message", data: normalizeServerMessage(event.data) });
        }
      });
      socket.addEventListener("error", () => {
        writeEvent(state, { type: "error" });
        if (!state.manualClose) {
          showConnectionError("The browser could not establish a WebSocket connection to the multiplayer server.");
        }
      });
      socket.addEventListener("close", (event) => {
        const reason = event.reason || (event.code === 1006
          ? "The WebSocket closed abnormally without a server response."
          : "The multiplayer server closed the connection.");
        writeEvent(state, { type: "close", code: event.code, reason });
        if (!state.manualClose) {
          showConnectionError(`WebSocket closed (${event.code})\n${reason}`);
        }
        state.active = false;
        if (sockets.get(name) === state) sockets.delete(name);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Authentication failed";
      writeEvent(state, {
        type: "close",
        code: 4003,
        reason,
      });
      showConnectionError(reason);
      state.active = false;
    }
  }

  function send(name, message) {
    const socket = sockets.get(name)?.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(message);
  }

  function close(name) {
    const state = sockets.get(name);
    if (state) {
      state.active = false;
      state.manualClose = true;
    }
    if (state?.socket && state.socket.readyState < WebSocket.CLOSING) {
      state.socket.close(1000, "Client closed");
    }
    sockets.delete(name);
  }

  globalThis.TechminoSocket = { connect, send, close };
})();
