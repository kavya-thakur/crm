import { getCurrentUser } from "./getCurrentUser";

/*
 * Site admins run the whole website (Settings > Site admin): they see every workspace and every
 * user, and can log in as anyone. Two ways to be one:
 *  - root: your email is in SITE_ADMIN_EMAILS (the server's settings), so nothing in the app can
 *    give or take it. Roots can also make others site admins from the admin page.
 *  - User.isSiteAdmin in the database: given by a root, or set straight in the database.
 */

const rootEmails = () =>
    (process.env.SITE_ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

export function isRootAdmin(user: { email: string }) {
    return rootEmails().includes(user.email.toLowerCase());
}

export function isSiteAdmin(user: { email: string; isSiteAdmin: boolean }) {
    return user.isSiteAdmin || isRootAdmin(user);
}

// The signed-in site admin, as themselves: while logged in as someone else you're that person,
// so the admin pages are closed until you go back
export async function requireSiteAdmin() {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.actingAsId || !isSiteAdmin(user)) throw new Error("FORBIDDEN");
    return user;
}
