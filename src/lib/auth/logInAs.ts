import { cookies } from "next/headers";
import { createToken, LOG_IN_AS_SECONDS, OWN_SESSION_COOKIE, sessionCookie } from "./jwt";

/**
 * Switches the session to another person for an hour ("Log in as"), keeping your own session
 * aside in its cookie for "Back to my account" (/api/auth/back). The caller checks who may.
 */
export async function startLogInAs(realUserId: number, person: { id: number; organizationId: number }) {
    const store = await cookies();
    const own = store.get("access_token")?.value;
    if (!own) throw new Error("UNAUTHORIZED");

    store.set(OWN_SESSION_COOKIE, own, sessionCookie(LOG_IN_AS_SECONDS));
    store.set(
        "access_token",
        createToken({ userId: person.id, organizationId: person.organizationId, actingAs: realUserId }, LOG_IN_AS_SECONDS),
        sessionCookie(LOG_IN_AS_SECONDS),
    );
}
