export function createRentalEventHub({ heartbeatMs = 25000, maxConnectionMs = 50 * 60 * 1000 } = {}) {
  const clients = new Set();
  let sequence = 0;

  function remove(client) {
    clients.delete(client);
    clearTimeout(client.expirationTimer);
    client.response.off('close', client.onClose);
    client.response.off('error', client.onError);
  }

  function write(client, event, data) {
    const response = client.response;
    if (response.destroyed || response.writableEnded) {
      remove(client);
      return false;
    }
    try {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      remove(client);
      return false;
    }
  }

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.response.destroyed || client.response.writableEnded) {
        remove(client);
        continue;
      }
      try { client.response.write(': keep-alive\n\n'); }
      catch { remove(client); }
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  return {
    subscribe(response, { uid, staff }) {
      const client = { response, uid: String(uid), staff: staff === true };
      client.onClose = () => remove(client);
      client.onError = () => remove(client);
      client.expirationTimer = setTimeout(() => {
        if (!response.destroyed && !response.writableEnded) response.end();
      }, maxConnectionMs);
      client.expirationTimer.unref?.();
      clients.add(client);
      response.on('close', client.onClose);
      response.on('error', client.onError);
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      response.flushHeaders?.();
      response.write('retry: 15000\n\n');
      write(client, 'ready', { revision: sequence });
      return () => remove(client);
    },
    publishRental({ rentalId = '', customerId = '', allCustomers = false } = {}) {
      const revision = ++sequence;
      const data = {
        revision,
        rentalId: String(rentalId || ''),
        occurredAt: new Date().toISOString()
      };
      const targetCustomer = String(customerId || '');
      for (const client of clients) {
        if (client.staff || allCustomers && !client.staff || targetCustomer && client.uid === targetCustomer) {
          write(client, 'rental.changed', data);
        }
      }
      return revision;
    },
    close() {
      clearInterval(heartbeat);
      for (const client of [...clients]) {
        remove(client);
        if (!client.response.writableEnded && !client.response.destroyed) client.response.end();
      }
    },
    get subscriberCount() { return clients.size; }
  };
}
