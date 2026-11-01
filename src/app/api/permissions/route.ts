import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError } from "@/lib/api/http";

// The catalogue a role form picks permissionIds from; permissions are global, not per org
export async function GET() {
    try {
        await requirePermission("role:read");

        const permissions = await prisma.permission.findMany({
            orderBy: { name: "asc" },
        });

        return NextResponse.json({
            ok: true,
            data: permissions,
        });
    } catch (error) {
        return handleRouteError(error, "Get permissions");
    }
}
