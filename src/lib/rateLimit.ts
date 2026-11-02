// A simple limit on how often one visitor can do something, e.g. send a public form: at
// most `limit` times per `windowMs`. Returns true when this attempt is one too many.
// ponytail: the counts live in this server's memory, so each server (or restart) keeps its
// own; move them to Redis if Flash ever runs on more than one.
const attempts = new Map<string, number[]>();

export function tooManyAttempts(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
        attempts.set(key, recent);
        return true;
    }

    recent.push(now);
    attempts.set(key, recent);
    return false;
}
