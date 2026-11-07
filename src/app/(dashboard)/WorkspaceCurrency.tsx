"use client";

import { setWorkspaceCurrency } from "@/lib/utils/format";

/**
 * Makes every amount on screen use the workspace's currency (formatMoney and friends). Rendered
 * first in the dashboard layout, so it's set before any page under it renders. Only in the
 * browser: on the server one module is shared by every workspace's requests.
 */
export function WorkspaceCurrency({ code }: { code: string }) {
    if (typeof window !== "undefined") setWorkspaceCurrency(code);
    return null;
}
