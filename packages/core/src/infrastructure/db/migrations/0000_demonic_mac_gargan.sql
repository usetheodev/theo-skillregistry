CREATE TABLE "operations" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"type" text NOT NULL,
	"state" text NOT NULL,
	"error" text,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"skill_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
