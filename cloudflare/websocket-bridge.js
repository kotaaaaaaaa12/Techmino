(() => {
  "use strict";

  const serverUrl = globalThis.TECHMINO_SERVER_URL;
  if (!serverUrl) throw new Error("TECHMINO_SERVER_URL is not configured");

  const sockets = new Map();
  const guestNameKey = "techmino.guestName";
  const refreshTokenKey = "techmino.supabaseRefreshToken";
  const memoryStorage = new Map();

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
    if (!response.ok) throw new Error(`Authentication failed (${response.status})`);
    const session = await response.json();
    setStoredValue(refreshTokenKey, session.refreshToken);
    return session;
  }

  async function connect(name, socketPath, saveDirectory) {
    close(name);
    const state = { name, saveDirectory, sequence: 0, socket: null, active: true };
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
      socket.addEventListener("open", () => writeEvent(state, { type: "open" }));
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          writeEvent(state, { type: "message", data: normalizeServerMessage(event.data) });
        }
      });
      socket.addEventListener("error", () => writeEvent(state, { type: "error" }));
      socket.addEventListener("close", (event) => {
        writeEvent(state, { type: "close", code: event.code, reason: event.reason || "Connection closed" });
        state.active = false;
        if (sockets.get(name) === state) sockets.delete(name);
      });
    } catch (error) {
      writeEvent(state, {
        type: "close",
        code: 4003,
        reason: error instanceof Error ? error.message : "Authentication failed",
      });
      state.active = false;
    }
  }

  function send(name, message) {
    const socket = sockets.get(name)?.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.send(message);
  }

  function close(name) {
    const state = sockets.get(name);
    if (state) state.active = false;
    if (state?.socket && state.socket.readyState < WebSocket.CLOSING) {
      state.socket.close(1000, "Client closed");
    }
    sockets.delete(name);
  }

  globalThis.TechminoSocket = { connect, send, close };
})();
