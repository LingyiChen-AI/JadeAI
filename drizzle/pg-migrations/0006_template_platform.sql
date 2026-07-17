CREATE TABLE "resume_template_tags" (
	"template_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "resume_template_tags_template_id_tag_id_pk" PRIMARY KEY("template_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "resume_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version" text NOT NULL,
	"schema_version" integer NOT NULL,
	"renderer_kind" text NOT NULL,
	"manifest" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"capabilities" text NOT NULL,
	"thumbnail_path" text NOT NULL,
	"preview_path" text NOT NULL,
	"provenance" text NOT NULL,
	"status" text NOT NULL,
	"fallback_version_id" text,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"published_at" integer,
	CONSTRAINT "resume_template_versions_template_id_id_unique" UNIQUE("template_id","id"),
	CONSTRAINT "resume_template_versions_renderer_kind_check" CHECK ("resume_template_versions"."renderer_kind" in ('legacy-react', 'declarative-v1')),
	CONSTRAINT "resume_template_versions_status_check" CHECK ("resume_template_versions"."status" in ('draft', 'published', 'deprecated', 'blocked')),
	CONSTRAINT "resume_template_versions_manifest_hash_check" CHECK ("resume_template_versions"."manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "resume_template_versions_thumbnail_path_check" CHECK ("resume_template_versions"."thumbnail_path" ~ '^templates/[a-z0-9]+(?:-[a-z0-9]+)*/v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)/thumbnail-[0-9a-f]{16}\.png$'),
	CONSTRAINT "resume_template_versions_preview_path_check" CHECK ("resume_template_versions"."preview_path" ~ '^templates/[a-z0-9]+(?:-[a-z0-9]+)*/v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)/preview-[0-9a-f]{16}\.png$'),
	CONSTRAINT "resume_template_versions_fallback_check" CHECK ("resume_template_versions"."fallback_version_id" is null or "resume_template_versions"."fallback_version_id" <> "resume_template_versions"."id")
);
--> statement-breakpoint
CREATE TABLE "resume_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_en" text NOT NULL,
	"description_zh" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"category_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text,
	"source_revision" text,
	"license_spdx" text NOT NULL,
	"license_url" text NOT NULL,
	"license_hash" text NOT NULL,
	"status" text NOT NULL,
	"stable_version_id" text,
	"search_text" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"published_at" integer,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "resume_templates_source_kind_check" CHECK ("resume_templates"."source_kind" in ('native', 'jsonresume', 'reactive-resume', 'other')),
	CONSTRAINT "resume_templates_status_check" CHECK ("resume_templates"."status" in ('draft', 'validating', 'published', 'unlisted', 'blocked')),
	CONSTRAINT "resume_templates_usage_count_check" CHECK ("resume_templates"."usage_count" >= 0),
	CONSTRAINT "resume_templates_slug_check" CHECK ("resume_templates"."slug" = lower("resume_templates"."slug") and "resume_templates"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "template_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "template_categories_is_active_check" CHECK ("template_categories"."is_active" in (0, 1)),
	CONSTRAINT "template_categories_slug_check" CHECK ("template_categories"."slug" = lower("template_categories"."slug") and "template_categories"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "template_favorites" (
	"user_id" text NOT NULL,
	"template_id" text NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "template_favorites_user_id_template_id_pk" PRIMARY KEY("user_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "template_recent_usage" (
	"user_id" text NOT NULL,
	"template_id" text NOT NULL,
	"last_used_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "template_recent_usage_user_id_template_id_pk" PRIMARY KEY("user_id","template_id"),
	CONSTRAINT "template_recent_usage_use_count_check" CHECK ("template_recent_usage"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "template_tag_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"locale" text NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"dimension" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "template_tags_is_active_check" CHECK ("template_tags"."is_active" in (0, 1)),
	CONSTRAINT "template_tags_dimension_check" CHECK ("template_tags"."dimension" in ('layout', 'style', 'scenario', 'capability', 'paper', 'source', 'export'))
);
--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "template_version_id" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "template_source" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "template_snapshot" text;--> statement-breakpoint
ALTER TABLE "resume_template_tags" ADD CONSTRAINT "resume_template_tags_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_template_tags" ADD CONSTRAINT "resume_template_tags_tag_id_template_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."template_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_template_versions" ADD CONSTRAINT "resume_template_versions_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_template_versions" ADD CONSTRAINT "resume_template_versions_fallback_version_id_resume_template_versions_id_fk" FOREIGN KEY ("fallback_version_id") REFERENCES "public"."resume_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_templates" ADD CONSTRAINT "resume_templates_category_id_template_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."template_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_templates" ADD CONSTRAINT "resume_templates_stable_version_fk" FOREIGN KEY ("id","stable_version_id") REFERENCES "public"."resume_template_versions"("template_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_favorites" ADD CONSTRAINT "template_favorites_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_recent_usage" ADD CONSTRAINT "template_recent_usage_template_id_resume_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."resume_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_tag_aliases" ADD CONSTRAINT "template_tag_aliases_tag_id_template_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."template_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_template_tags_tag_template_idx" ON "resume_template_tags" USING btree ("tag_id","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_template_versions_template_version_uidx" ON "resume_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "resume_template_versions_template_status_version_idx" ON "resume_template_versions" USING btree ("template_id","status","version");--> statement-breakpoint
CREATE INDEX "resume_template_versions_manifest_hash_idx" ON "resume_template_versions" USING btree ("manifest_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_templates_slug_uidx" ON "resume_templates" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_templates_id_stable_uidx" ON "resume_templates" USING btree ("id","stable_version_id");--> statement-breakpoint
CREATE INDEX "resume_templates_status_category_published_idx" ON "resume_templates" USING btree ("status","category_id","published_at","id");--> statement-breakpoint
CREATE INDEX "resume_templates_status_usage_idx" ON "resume_templates" USING btree ("status","usage_count","id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_categories_slug_uidx" ON "template_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "template_categories_active_sort_idx" ON "template_categories" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "template_favorites_user_created_idx" ON "template_favorites" USING btree ("user_id","created_at","template_id");--> statement-breakpoint
CREATE INDEX "template_recent_usage_user_last_used_idx" ON "template_recent_usage" USING btree ("user_id","last_used_at","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_tag_aliases_locale_normalized_uidx" ON "template_tag_aliases" USING btree ("locale","normalized_alias");--> statement-breakpoint
CREATE INDEX "template_tag_aliases_tag_idx" ON "template_tag_aliases" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_tags_slug_uidx" ON "template_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "template_tags_dimension_active_sort_idx" ON "template_tags" USING btree ("dimension","is_active","sort_order");--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_template_version_id_resume_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."resume_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resumes_template_version_id_idx" ON "resumes" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "resumes_template_source_idx" ON "resumes" USING btree ("template_source");--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_template_source_check" CHECK ("resumes"."template_source" in ('legacy', 'public', 'local-snapshot'));