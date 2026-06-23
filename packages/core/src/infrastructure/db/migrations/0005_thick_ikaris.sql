ALTER TABLE "skills" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED;--> statement-breakpoint
CREATE INDEX "skills_search_tsv_gin" ON "skills" USING gin ("search_tsv");