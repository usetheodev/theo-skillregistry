CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"enqueued_at" timestamp with time zone,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"event_types" jsonb,
	"create_time" timestamp with time zone DEFAULT now() NOT NULL,
	"update_time" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_orphan_scan" ON "webhook_deliveries" USING btree ("create_time") WHERE "webhook_deliveries"."delivered_at" IS NULL AND "webhook_deliveries"."failed_at" IS NULL AND "webhook_deliveries"."enqueued_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_idempotency_key_uq" ON "operations" USING btree ("idempotency_key") WHERE "operations"."idempotency_key" IS NOT NULL;