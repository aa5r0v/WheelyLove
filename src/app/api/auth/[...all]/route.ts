import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Initialized lazily on the first request so that `next build` (which still
// evaluates route modules) never needs BETTER_AUTH_SECRET or a database.
let handlers: ReturnType<typeof toNextJsHandler> | null = null;

function getHandlers() {
  if (!handlers) handlers = toNextJsHandler(getAuth());
  return handlers;
}

export function GET(req: Request) {
  return getHandlers().GET(req);
}

export function POST(req: Request) {
  return getHandlers().POST(req);
}
