import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { handleRouteError, validationError } from "@/lib/api/http";
import { idParamSchema } from "@/lib/validations/common";
import { binScope, restoreFromBin, RestoreProblem } from "@/lib/recycleBin";

type Context = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ ok: false, message: "It's not in the recycle bin any more" }, { status: 404 });

// Restore: puts it back as it was, with its history, under the same id
export async function POST(_req: NextRequest, { params }: Context) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const restored = await restoreFromBin(user, id.data);
        if (!restored) return notFound();

        return NextResponse.json({ ok: true, message: `${restored.name} is back`, data: restored });
    } catch (error) {
        if (error instanceof RestoreProblem) return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
        return handleRouteError(error, "Restore from recycle bin");
    }
}

// Delete forever, before its 30 days are up
export async function DELETE(_req: NextRequest, { params }: Context) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const id = idParamSchema.safeParse((await params).id);
        if (!id.success) return validationError(id.error);

        const { count } = await prisma.deletedRecord.deleteMany({ where: { id: id.data, ...binScope(user) } });
        if (count === 0) return notFound();

        return NextResponse.json({ ok: true, message: "Deleted forever" });
    } catch (error) {
        return handleRouteError(error, "Delete from recycle bin");
    }
}
