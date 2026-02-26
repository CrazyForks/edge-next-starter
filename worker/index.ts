/**
 * Cloudflare Worker entry point for vinext
 *
 * Delegates all requests to vinext's App Router handler.
 * Cloudflare bindings (D1, R2, KV) are passed via the `env` parameter
 * and accessible in route handlers via `import { env } from "cloudflare:workers"`.
 */
import handler from 'vinext/server/app-router-entry';

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    return (
      handler as { fetch: (req: Request, env: unknown, ctx: ExecutionContext) => Promise<Response> }
    ).fetch(request, env, ctx);
  },
};
