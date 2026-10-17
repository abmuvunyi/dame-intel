// Phase 14: render an unknown thrown value for a single-line structured log message
// (stack when available), instead of passing raw objects to console.*.
export function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  try {
    return typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}
