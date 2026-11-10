-- Payments can be recorded by hand (UPI, bank transfer, cash) when a site admin switches Pro on,
-- not only made online through Razorpay: so the Razorpay fields become optional, and a manual one
-- keeps its reference and who recorded it. Every existing payment was online.
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'RAZORPAY',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "recordedBy" TEXT,
ALTER COLUMN "razorpayOrderId" DROP NOT NULL,
ALTER COLUMN "razorpayPaymentId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
