CREATE TABLE "resume_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"token" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"password" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "resume_shares_token_unique" UNIQUE("token")
);
