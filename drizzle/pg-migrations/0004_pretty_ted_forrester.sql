CREATE TABLE "recruit_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resume_text" text DEFAULT '' NOT NULL,
	"resume_data" text,
	"dimensions_override" text,
	"questions" text,
	"transcript" text DEFAULT '' NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruit_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimension_scores" text NOT NULL,
	"question_evaluations" text NOT NULL,
	"recommendation" text NOT NULL,
	"recommendation_reason" text DEFAULT '' NOT NULL,
	"strengths" text DEFAULT '[]' NOT NULL,
	"concerns" text DEFAULT '[]' NOT NULL,
	"overall_comment" text DEFAULT '' NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "recruit_evaluations_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
CREATE TABLE "recruit_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"job_description" text NOT NULL,
	"dimensions" text DEFAULT '[]' NOT NULL,
	"question_count" integer DEFAULT 10 NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
