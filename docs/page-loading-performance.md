# Page loading improvements

The previous navigation path invalidated the entire workspace cache on every page change. It also shared a single pending request between unrelated pages. Returning to a page therefore repeated the loading screen, and a slow request could hold up a different page.

The controller now keeps up to 24 in-memory snapshots keyed by the exact request, including date ranges, status, search and cursor. Fresh snapshots are reused for 30 seconds; older snapshots remain visible during background revalidation. Writes mark them stale, and sign-out clears snapshots and rejects late responses from the previous session.

After authentication, the active page has priority. Two idle-time workers warm the other workspace pages, including Payments, while Equipment warms its own cache. Sidebar hover/focus can also prefetch a destination. A click shares any existing request. This prepares content for the first visit rather than relying only on revisit caching. It cannot make an uncached server response instantaneous; clicks made before preloading finishes still need that response.

Local analytics category/equipment/grouping controls reuse the loaded reporting window. Changing the date window fetches the relevant data. Cash collections load when their disclosure opens. Equipment reuses recent snapshots and refreshes after a save or explicit refresh.

Independent workspace database reads now start together. Settings and Rates skip unrelated rental/history collections. Named web workspace payloads omit equipment photo data; the inventory/detail endpoints continue to provide images. Audit and stock history preserve their saved public reference codes: dropping these codes previously caused reference enrichment to reread every log record, including records whose codes were already saved.

Unchanged page HTML is kept mounted, preserving chart interactions and avoiding redundant listener binding. React's development bundle rebuilds when source inputs change, and static assets support ETag revalidation instead of downloading unchanged files again. HTML and API responses retain their existing no-store behavior.

Verification covers first visits after preloading, revisits without new requests, bounded background concurrency, in-flight sharing, cross-page races, stale-content retention, save/sign-out invalidation, local analytics filters, lazy cash queries, equipment freshness, parallel database reads, smaller payloads, public-reference rereads and conditional static asset responses. Full suites run with `npm test` in `apps/web` and `apps/backend`; HTTP tests need permission to connect to localhost.
