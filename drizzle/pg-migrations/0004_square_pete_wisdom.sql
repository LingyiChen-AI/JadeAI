CREATE TABLE "announcement_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notify_mode" text DEFAULT 'silent' NOT NULL,
	"starts_at" integer,
	"ends_at" integer,
	"created_by" text,
	"updated_by" text,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_reads_announcement_user_unique" ON "announcement_reads" USING btree ("announcement_id","user_id");
--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "announcements_notify_mode_idx" ON "announcements" USING btree ("notify_mode");
--> statement-breakpoint
CREATE INDEX "announcements_created_at_idx" ON "announcements" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "announcements_starts_at_idx" ON "announcements" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX "announcements_ends_at_idx" ON "announcements" USING btree ("ends_at");
--> statement-breakpoint
CREATE INDEX "announcement_reads_user_idx" ON "announcement_reads" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "announcement_reads_read_at_idx" ON "announcement_reads" USING btree ("read_at");
