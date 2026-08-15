CREATE TABLE "interview_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" text DEFAULT '{}',
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimension_scores" text NOT NULL,
	"round_evaluations" text NOT NULL,
	"overall_feedback" text NOT NULL,
	"improvement_plan" text NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	CONSTRAINT "interview_reports_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "interview_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"interviewer_type" text NOT NULL,
	"interviewer_config" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"max_questions" integer DEFAULT 10 NOT NULL,
	"summary" text,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"resume_id" text,
	"job_description" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"selected_interviewers" text DEFAULT '[]' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"created_at" integer DEFAULT extract(epoch from now())::integer NOT NULL,
	"updated_at" integer DEFAULT extract(epoch from now())::integer NOT NULL
);
