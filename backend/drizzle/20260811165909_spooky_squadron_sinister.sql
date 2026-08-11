ALTER TABLE "workspaces" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workspaces" SET "onboarding_completed_at" = NOW();
