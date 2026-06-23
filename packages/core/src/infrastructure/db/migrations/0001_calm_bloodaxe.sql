CREATE TABLE "skill_revisions" (
	"revision_id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"payload" "bytea" NOT NULL,
	"content_hash" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "latest_revision_id" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "reserved_until" timestamp with time zone;