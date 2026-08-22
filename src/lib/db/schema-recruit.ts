import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './schema';

export const recruitJobs = sqliteTable('recruit_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  jobDescription: text('job_description').notNull(),
  dimensions: text('dimensions', { mode: 'json' }).notNull().default('[]'),
  questionCount: integer('question_count').notNull().default(10),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const recruitCandidates = sqliteTable('recruit_candidates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text('job_id').notNull().references(() => recruitJobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  status: text('status', { enum: ['pending', 'questions_ready', 'evaluated'] })
    .notNull()
    .default('pending'),
  resumeText: text('resume_text').notNull().default(''),
  resumeData: text('resume_data', { mode: 'json' }),
  dimensionsOverride: text('dimensions_override', { mode: 'json' }),
  questions: text('questions', { mode: 'json' }),
  transcript: text('transcript').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const recruitEvaluations = sqliteTable('recruit_evaluations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidateId: text('candidate_id')
    .notNull()
    .references(() => recruitCandidates.id, { onDelete: 'cascade' })
    .unique(),
  overallScore: integer('overall_score').notNull(),
  dimensionScores: text('dimension_scores', { mode: 'json' }).notNull(),
  questionEvaluations: text('question_evaluations', { mode: 'json' }).notNull(),
  recommendation: text('recommendation', {
    enum: ['strong_hire', 'hire', 'hold', 'no_hire'],
  }).notNull(),
  recommendationReason: text('recommendation_reason').notNull().default(''),
  strengths: text('strengths', { mode: 'json' }).notNull().default('[]'),
  concerns: text('concerns', { mode: 'json' }).notNull().default('[]'),
  overallComment: text('overall_comment').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
