CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"vector" vector(1536) NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_revisions" ADD COLUMN "skill_md" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_revision_id_skill_revisions_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."skill_revisions"("revision_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_revision_provider_model_uq" ON "embeddings" USING btree ("revision_id","provider","model");--> statement-breakpoint
CREATE INDEX "embeddings_vector_hnsw" ON "embeddings" USING hnsw ("vector" vector_cosine_ops);