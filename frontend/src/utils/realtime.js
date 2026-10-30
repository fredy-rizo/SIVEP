// ============================================================================
// CLIENTE WEBSOCKET COMPARTIDO — stock en tiempo real
// ----------------------------------------------------------------------------
// ¿POR QUÉ un singleton?
//   La landing tiene varios botones "Comprar" y el formulario público también
//   escucha cambios. Si cada componente abriera su propio WebSocket tendríamos
//   varias conexiones por pestaña. Aquí todos comparten un canal por credencial.
//
// ¿CÓMO funciona?
//   - `subscribeToStock(fn)` agrega un listener y abre el canal si es el primero.
//   - Al cerrarse la conexión se reintenta con backoff exponencial (1s, 2s, 4s…
//     hasta 30s), así una caída breve del backend no deja la página congelada.
//   - Cuando el último listener se va, el socket se cierra.
//
// AUTENTICACIÓN: el visitante público no envía token y el servidor lo une a la
// organización pública. Un usuario interno puede pasar `token` para escuchar su
// propia organización. El servidor ignora cualquier organizationId del cliente.
// ============================================================================

const MAX_RETRY_DELAY_MS = 30_000;

// Map<string, Channel>; la clave es el token o "public".
const channels = new Map();

function buildUrl(token) {
  const explicit = import.meta.env.VITE_WS_URL;
  let url;

  if (explicit) {
    url = new URL(explicit, window.location.origin);
  } else {
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    if (/^https?:\/\//i.test(apiUrl)) {
      const parsed = new URL(apiUrl);
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      parsed.pathname = '/ws';
      parsed.search = '';
      parsed.hash = '';
      url = parsed;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = new URL(`${protocol}//${window.location.host}/ws`);
    }
  }

  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function getChannel(token) {
  const key = token || 'public';
  if (!channels.has(key)) {
    channels.set(key, {
      token,
      socket: null,
      listeners: new Set(),
      statusListeners: new Set(),
      status: 'offline',
      retry: 0,
      reconnectTimer: null,
    });
  }
  return channels.get(key);
}

function setStatus(channel, status) {
  if (channel.status === status) return;
  channel.status = status;
  for (const listener of channel.statusListeners) {
    try {
      listener(status);
    } catch {
      /* un listener roto no debe afectar a los demás */
    }
  }
}

function notifyStock(channel, message) {
  for (const listener of channel.listeners) {
    try {
      listener(message);
    } catch (error) {
      console.error('[stock] listener error:', error);
    }
  }
}

function scheduleReconnect(channel) {
  if (channel.listeners.size === 0) return;

  const delay = Math.min(
    MAX_RETRY_DELAY_MS,
    1000 * 2 ** Math.min(channel.retry, 5),
  );
  channel.retry += 1;
  channel.reconnectTimer = setTimeout(() => connect(channel), delay);
}

function connect(channel) {
  if (channel.listeners.size === 0) return;
  if (
    channel.socket &&
    (channel.socket.readyState === window.WebSocket.OPEN ||
      channel.socket.readyState === window.WebSocket.CONNECTING)
  ) {
    return;
  }

  setStatus(channel, channel.retry > 0 ? 'reconnecting' : 'connecting');

  let socket;
  try {
    socket = new window.WebSocket(buildUrl(channel.token));
  } catch (error) {
    console.error('[stock] no se pudo crear el WebSocket:', error);
    scheduleReconnect(channel);
    return;
  }

  channel.socket = socket;

  socket.onopen = () => {
    channel.retry = 0;
    setStatus(channel, 'online');
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message?.type === 'stock:update') notifyStock(channel, message);
    } catch {
      /* mensaje malformado: se ignora */
    }
  };

  socket.onerror = () => {
    // `close` se encarga de la reconexión; aquí solo forzamos el cierre.
    socket.close();
  };

  socket.onclose = () => {
    channel.socket = null;
    setStatus(channel, 'offline');
    scheduleReconnect(channel);
  };
}

// Suscribe un callback a los eventos `stock:update`. Devuelve la función para
// darse de baja (ideal para el cleanup de un useEffect).
export function subscribeToStock(listener, { token = null } = {}) {
  const channel = getChannel(token);
  channel.listeners.add(listener);
  connect(channel);

  return () => {
    channel.listeners.delete(listener);
    if (channel.listeners.size > 0) return;

    clearTimeout(channel.reconnectTimer);
    channel.reconnectTimer = null;
    if (channel.socket) {
      channel.socket.onclose = null; // cierre intencional: no reconectar
      channel.socket.close();
      channel.socket = null;
    }
    setStatus(channel, 'offline');
    channels.delete(token || 'public');
  };
}

// Permite pintar un indicador "En vivo" / "Sin conexión".
export function subscribeToStatus(listener, { token = null } = {}) {
  const channel = getChannel(token);
  channel.statusListeners.add(listener);
  listener(channel.status);

  return () => {
    channel.statusListeners.delete(listener);
  };
}

export function getRealtimeStatus(token = null) {
  return getChannel(token).status;
}
