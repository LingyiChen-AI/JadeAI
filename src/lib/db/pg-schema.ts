/**
 * PostgreSQL schema — mirrors schema.ts (SQLite) with PG-native types.
 * Used ONLY by drizzle-kit for PG migration generation.
 * Runtime code still imports table objects from schema.ts.
 */
import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const epochNow = sql`extract(epoch from now())::integer`;

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  fingerprint: text('fingerprint').unique(),
  authType: text('auth_type').notNull(),
  settings: text('settings').default('{}'),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const authAccounts = pgTable('auth_accounts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenType: text('token_type'),
  expiresAt: integer('expires_at'),
  scope: text('scope'),
  createdAt: integer('created_at').notNull().default(epochNow),
});

export const resumes = pgTable('resumes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('未命名简历'),
  template: text('template').notNull().default('classic'),
  themeConfig: text('theme_config').default('{}'),
  isDefault: integer('is_default').notNull().default(0),
  language: text('language').notNull().default('zh'),
  shareToken: text('share_token'),
  isPublic: integer('is_public').notNull().default(0),
  sharePassword: text('share_password'),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const resumeSections = pgTable('resume_sections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: integer('visible').notNull().default(1),
  content: text('content').notNull().default('{}'),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  title: text('title').notNull().default('新对话'),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata').default('{}'),
  createdAt: integer('created_at').notNull().default(epochNow),
});

export const resumeShares = pgTable('resume_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  token: text('token').notNull().unique(),
  label: text('label').notNull().default(''),
  password: text('password'),
  viewCount: integer('view_count').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const jdAnalyses = pgTable('jd_analyses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  jobDescription: text('job_description').notNull(),
  result: text('result').notNull(),
  overallScore: integer('overall_score').notNull(),
  atsScore: integer('ats_score').notNull(),
  createdAt: integer('created_at').notNull().default(epochNow),
});

export const grammarChecks = pgTable('grammar_checks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  result: text('result').notNull(),
  score: integer('score').notNull(),
  issueCount: integer('issue_count').notNull(),
  createdAt: integer('created_at').notNull().default(epochNow),
});

// ── Interview simulation tables ──

export const interviewSessions = pgTable('interview_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  resumeId: text('resume_id'),
  jobDescription: text('job_description').notNull(),
  jobTitle: text('job_title').notNull().default(''),
  selectedInterviewers: text('selected_interviewers').notNull().default('[]'),
  currentRound: integer('current_round').notNull().default(0),
  status: text('status').notNull().default('preparing'),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const interviewRounds = pgTable('interview_rounds', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull(),
  interviewerType: text('interviewer_type').notNull(),
  interviewerConfig: text('interviewer_config').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status').notNull().default('pending'),
  questionCount: integer('question_count').notNull().default(0),
  maxQuestions: integer('max_questions').notNull().default(10),
  summary: text('summary'),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const interviewMessages = pgTable('interview_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  roundId: text('round_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata').default('{}'),
  createdAt: integer('created_at').notNull().default(epochNow),
});

export const interviewReports = pgTable('interview_reports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().unique(),
  overallScore: integer('overall_score').notNull(),
  dimensionScores: text('dimension_scores').notNull(),
  roundEvaluations: text('round_evaluations').notNull(),
  overallFeedback: text('overall_feedback').notNull(),
  improvementPlan: text('improvement_plan').notNull(),
  createdAt: integer('created_at').notNull().default(epochNow),
});
