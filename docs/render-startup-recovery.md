# Render startup and recovery

The Free instance sleeps after 15 minutes without inbound traffic. Opening the URL wakes it; this normally takes about a minute. A deploy is not required for a normal wake-up.

## Confirmed request failures in the supplied logs

- `changes is not defined`: repeated customer profile POST requests referenced a transaction-local variable after its callback ended. The transaction now returns the collections it actually wrote.
- `rentalEvents is not defined`: the customer profile service tried to access an event hub owned by the HTTP server. Customer changes now use a service subscription, connected and disconnected by the server.

These errors break profile requests; the screenshot does not establish that they caused the initial Render startup screen to hang. The server continued reporting activity after these request errors.

## Recovery changes

Supabase RPC and storage requests have a 15-second abort deadline. Health dependency checks have a shorter deadline and retry failed health checks after five seconds rather than caching a failure for a minute.

`GET /api/ready` returns 200 only on a successful dependency check, and 503 on failure or timeout. The legacy `/api/health` JSON contract remains unchanged for clients.

After deploying, set the Render HTTP Health Check Path to `/api/ready`. This is specified in `render.yaml` for Blueprint-managed services. If the service was configured manually, apply the same path in its Render Settings; a normal Git deploy does not necessarily apply Blueprint settings. HTTP health checks do not keep Free instances awake or eliminate cold starts.

If a future incident occurs, capture whether the page is Render's startup screen or Rent & Play's workspace screen, the incident time, and the corresponding Events and Logs. Check for failed instance events, exit codes, memory exhaustion, and request errors before redeploying. No paid-plan change or keep-alive monitor was configured by this fix.
