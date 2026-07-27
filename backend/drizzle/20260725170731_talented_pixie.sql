CREATE TABLE "github_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
