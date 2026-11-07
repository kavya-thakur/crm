import type { Prisma } from "@/generated/prisma/client";
import { quoteTotals } from "./quote";

/**
 * After a deal's lines change: its amount becomes their total (with tax), so the pipeline, the
 * dashboard and the quote show the same number. With no lines left, the amount stays as it was,
 * typed in by hand again. Run it in the same transaction as the change.
 */
export async function syncDealAmount(tx: Prisma.TransactionClient, dealId: number, userId: number) {
    const lines = await tx.dealProduct.findMany({ where: { dealId } });
    if (lines.length === 0) return;
    await tx.deal.update({ where: { id: dealId }, data: { amount: quoteTotals(lines.map((line) => ({ ...line, price: Number(line.price) }))).total, updatedById: userId } });
}
