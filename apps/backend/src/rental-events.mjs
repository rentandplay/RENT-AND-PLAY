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

  function publishEvent(eventType, {
    collections = [],
    entityId = '',
    rentalId = '',
    customerId = '',
    allCustomers = false,
    payload = {}
  } = {}) {
    const revision = ++sequence;
    const finalRentalId = String(rentalId || (collections.includes('rentals') ? entityId : '') || '');
    const data = {
      revision,
      event: eventType,
      collections: Array.isArray(collections) ? collections : [collections].filter(Boolean),
      entityId: String(entityId || rentalId || ''),
      rentalId: finalRentalId,
      occurredAt: new Date().toISOString(),
      ...payload
    };

    const targetCustomer = String(customerId || '');
    for (const client of clients) {
      if (client.staff) {
        write(client, eventType, data);
        continue;
      }
      if (client.guest) {
        if (allCustomers || ['inventory.changed', 'category.changed', 'catalog.changed', 'data.changed'].includes(eventType)) {
          write(client, eventType, data);
        }
        continue;
      }
      // Authenticated customer
      const isPublicEvent = ['inventory.changed', 'category.changed', 'catalog.changed'].includes(eventType);
      const isTargetCustomer = targetCustomer && client.uid === targetCustomer;
      if (allCustomers || isTargetCustomer || isPublicEvent) {
        write(client, eventType, data);
      }
    }
    return revision;
  }

  return {
    subscribe(response, { uid = null, staff = false, guest = false } = {}) {
      const isStaff = staff === true;
      const isGuest = Boolean(guest || (!uid && !isStaff));
      const client = {
        response,
        uid: uid ? String(uid) : null,
        staff: isStaff,
        guest: isGuest
      };
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
      return publishEvent('rental.changed', {
        rentalId,
        customerId,
        allCustomers,
        collections: ['rentals']
      });
    },
    publishInventory({ itemId = '', categoryId = '', collections = ['items'] } = {}) {
      return publishEvent('inventory.changed', {
        entityId: itemId || categoryId,
        allCustomers: true,
        collections
      });
    },
    publishMaintenance({ recordId = '', itemId = '' } = {}) {
      return publishEvent('maintenance.changed', {
        entityId: recordId,
        payload: { itemId: String(itemId || '') },
        collections: ['maintenance_records']
      });
    },
    publishCustomer({ customerId = '' } = {}) {
      return publishEvent('customer.changed', {
        customerId,
        entityId: customerId,
        collections: ['customers']
      });
    },
    publishFinance({ expenseId = '', rentalId = '' } = {}) {
      return publishEvent('finance.changed', {
        entityId: expenseId || rentalId,
        collections: ['payment_ledger']
      });
    },
    publishDataChange(type, options) {
      return publishEvent(type, options);
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
