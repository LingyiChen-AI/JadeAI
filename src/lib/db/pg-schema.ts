/** PostgreSQL schema used by both drizzle-kit and the application runtime. */
import { customType, pgTable, text, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const epochNow = sql`extract(epoch from now())::integer`;
const epochTimestamp = customType<{ data: Date; driverData: number }>({
  dataType: () => 'integer',
  fromDriver: (value) => new Date(value * 1000),
  toDriver: (value) => Math.floor(value.getTime() / 1000),
});
const booleanInteger = customType<{ data: boolean; driverData: number }>({
  dataType: () => 'integer',
  fromDriver: (value) => value === 1,
  toDriver: (value) => value ? 1 : 0,
});
const jsonText = customType<{ data: unknown; driverData: string }>({
  dataType: () => 'text',
  fromDriver: (value) => JSON.parse(value),
  toDriver: (value) => JSON.stringify(value),
});

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  fingerprint: text('fingerprint').unique(),
  authType: text('auth_type').notNull(),
  role: text('role').notNull().default('user'),
  passwordHash: text('password_hash'),
  status: text('status').notNull().default('active'),
  tokenVersion: integer('token_version').notNull().default(0),
  settings: jsonText('settings').default(sql`'{}'`),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const announcements = pgTable('announcements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('draft'),
  notifyMode: text('notify_mode').notNull().default('silent'),
  startsAt: integer('starts_at'),
  endsAt: integer('ends_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const announcementReads = pgTable('announcement_reads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  announcementId: text('announcement_id').notNull(),
  userId: text('user_id').notNull(),
  readAt: epochTimestamp('read_at').notNull().default(epochNow),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
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
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});

export const resumes = pgTable('resumes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('未命名简历'),
  template: text('template').notNull().default('classic'),
  themeConfig: jsonText('theme_config').default(sql`'{}'`),
  isDefault: booleanInteger('is_default').notNull().default(0 as unknown as boolean),
  language: text('language').notNull().default('zh'),
  shareToken: text('share_token'),
  isPublic: booleanInteger('is_public').notNull().default(0 as unknown as boolean),
  sharePassword: text('share_password'),
  viewCount: integer('view_count').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const resumeSections = pgTable('resume_sections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  visible: booleanInteger('visible').notNull().default(1 as unknown as boolean),
  content: jsonText('content').notNull().default(sql`'{}'`),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  title: text('title').notNull().default('新对话'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonText('metadata').default(sql`'{}'`),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});

export const resumeShares = pgTable('resume_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  token: text('token').notNull().unique(),
  label: text('label').notNull().default(''),
  password: text('password'),
  viewCount: integer('view_count').notNull().default(0),
  isActive: booleanInteger('is_active').notNull().default(1 as unknown as boolean),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const jdAnalyses = pgTable('jd_analyses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  jobDescription: text('job_description').notNull(),
  result: jsonText('result').notNull(),
  overallScore: integer('overall_score').notNull(),
  atsScore: integer('ats_score').notNull(),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});

export const grammarChecks = pgTable('grammar_checks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id').notNull(),
  result: jsonText('result').notNull(),
  score: integer('score').notNull(),
  issueCount: integer('issue_count').notNull(),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});

// ── Interview simulation tables ──

export const interviewSessions = pgTable('interview_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  resumeId: text('resume_id'),
  jobDescription: text('job_description').notNull(),
  jobTitle: text('job_title').notNull().default(''),
  selectedInterviewers: jsonText('selected_interviewers').notNull().default(sql`'[]'`),
  currentRound: integer('current_round').notNull().default(0),
  status: text('status').notNull().default('preparing'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const interviewRounds = pgTable('interview_rounds', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull(),
  interviewerType: text('interviewer_type').notNull(),
  interviewerConfig: jsonText('interviewer_config').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: text('status').notNull().default('pending'),
  questionCount: integer('question_count').notNull().default(0),
  maxQuestions: integer('max_questions').notNull().default(10),
  summary: text('summary'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
});

export const interviewMessages = pgTable('interview_messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  roundId: text('round_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonText('metadata').default(sql`'{}'`),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});

export const interviewReports = pgTable('interview_reports', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().unique(),
  overallScore: integer('overall_score').notNull(),
  dimensionScores: jsonText('dimension_scores').notNull(),
  roundEvaluations: jsonText('round_evaluations').notNull(),
  overallFeedback: text('overall_feedback').notNull(),
  improvementPlan: jsonText('improvement_plan').notNull(),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
});
