import { describe, expect, it } from "vitest";
import { contactScope, dealScope, hasPermission, leadScope, type CurrentUser } from "./requirePermission";

// Only the fields these functions actually read: id, organizationId, and the
// flattened permission names on the role.
function fakeUser(organizationId: number, permissionNames: string[]): CurrentUser {
    return {
        id: 7,
        organizationId,
        role: {
            permissions: permissionNames.map((name) => ({ permission: { name } })),
        },
    } as unknown as CurrentUser;
}

describe("hasPermission", () => {
    it("is true when the role has the permission", () => {
        const user = fakeUser(1, ["lead:read"]);
        expect(hasPermission(user, "lead:read")).toBe(true);
    });

    it("is false when the role doesn't have the permission", () => {
        const user = fakeUser(1, ["lead:read"]);
        expect(hasPermission(user, "lead:delete")).toBe(false);
    });
});

describe("leadScope", () => {
    it("scopes to the organization only when the user has lead:all", () => {
        const user = fakeUser(5, ["lead:read", "lead:all"]);
        expect(leadScope(user)).toEqual({ organizationId: 5 });
    });

    it("also scopes to the user's own leads without lead:all", () => {
        const user = fakeUser(5, ["lead:read"]);
        expect(leadScope(user)).toEqual({ organizationId: 5, assignedToId: user.id });
    });
});

describe("dealScope", () => {
    it("scopes to the organization only when the user has deal:all", () => {
        const user = fakeUser(5, ["deal:read", "deal:all"]);
        expect(dealScope(user)).toEqual({ organizationId: 5 });
    });

    it("also scopes to the user's own deals without deal:all", () => {
        const user = fakeUser(5, ["deal:read"]);
        expect(dealScope(user)).toEqual({ organizationId: 5, assignedToId: user.id });
    });
});

describe("contactScope", () => {
    it("scopes to the organization only when the user has contact:all", () => {
        const user = fakeUser(5, ["contact:read", "contact:all"]);
        expect(contactScope(user)).toEqual({ organizationId: 5 });
    });

    it("also scopes to the user's own contacts without contact:all", () => {
        const user = fakeUser(5, ["contact:read"]);
        expect(contactScope(user)).toEqual({ organizationId: 5, assignedToId: user.id });
    });

    it("doesn't let a deal:all or lead:all permission leak into contact scope", () => {
        const user = fakeUser(5, ["contact:read", "lead:all", "deal:all"]);
        expect(contactScope(user)).toEqual({ organizationId: 5, assignedToId: user.id });
    });
});
