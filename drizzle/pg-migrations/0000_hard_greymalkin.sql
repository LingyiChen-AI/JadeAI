CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_type" text,
	"expires_at" integer,
	"scope" text,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" text DEFAULT '{}',
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"title" text DEFAULT '新对话' NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" integer DEFAULT 1 NOT NULL,
	"content" text DEFAULT '{}' NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '未命名简历' NOT NULL,
	"template" text DEFAULT 'classic' NOT NULL,
	"theme_config" text DEFAULT '{}',
	"is_default" integer DEFAULT 0 NOT NULL,
	"language" text DEFAULT 'zh' NOT NULL,
	"share_token" text,
	"is_public" integer DEFAULT 0 NOT NULL,
	"share_password" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"avatar_url" text,
	"fingerprint" text,
	"auth_type" text NOT NULL,
	"settings" text DEFAULT '{}',
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_fingerprint_unique" UNIQUE("fingerprint")
);
