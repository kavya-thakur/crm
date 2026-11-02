-- trigram matching, which the indexes below are built on (ships with Postgres)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Contact_name_email_idx" ON "Contact" USING GIN ("name" gin_trgm_ops, "email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Deal_title_idx" ON "Deal" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Lead_name_email_companyName_idx" ON "Lead" USING GIN ("name" gin_trgm_ops, "email" gin_trgm_ops, "companyName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ScheduledActivity_title_idx" ON "ScheduledActivity" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Task_title_idx" ON "Task" USING GIN ("title" gin_trgm_ops);
