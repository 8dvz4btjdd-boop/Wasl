import "server-only";

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; details?: unknown; hint?: unknown };

/**
 * Logs the real cause of a failure on the server. Users only ever see a generic message.
 * Never pass secrets (passwords, return codes) in `context`.
 */
export function logServerError(where: string, error: unknown, context?: Record<string, unknown>) {
  const e = (error ?? {}) as ErrorLike;
  console.error(`[${where}]`, {
    code: e.code,
    status: e.status,
    message: e.message ?? String(error),
    details: e.details,
    hint: e.hint,
    ...context,
  });
}
