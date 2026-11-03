-- AlterTable
ALTER TABLE "BulkJob" ADD COLUMN     "params" JSONB NOT NULL DEFAULT '{}';
