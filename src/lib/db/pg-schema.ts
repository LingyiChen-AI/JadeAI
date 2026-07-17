/** PostgreSQL schema used by both drizzle-kit and the application runtime. */
import {
  type AnyPgColumn,
  type PgTableExtraConfigValue,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
  templateVersionId: text('template_version_id').references((): AnyPgColumn => resumeTemplateVersions.id),
  templateSource: text('template_source').notNull().default('legacy'),
  templateSnapshot: jsonText('template_snapshot'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
}, (table): PgTableExtraConfigValue[] => [
  check('resumes_template_source_check', sql`${table.templateSource} in ('legacy', 'public', 'local-snapshot')`),
  index('resumes_template_version_id_idx').on(table.templateVersionId),
  index('resumes_template_source_idx').on(table.templateSource),
]);

export const templateCategories = pgTable('template_categories', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  nameZh: text('name_zh').notNull(),
  nameEn: text('name_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: booleanInteger('is_active').notNull().default(1 as unknown as boolean),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
}, (table) => [
  uniqueIndex('template_categories_slug_uidx').on(table.slug),
  index('template_categories_active_sort_idx').on(table.isActive, table.sortOrder),
  check('template_categories_is_active_check', sql`${table.isActive} in (0, 1)`),
  check('template_categories_slug_check', sql`${table.slug} = lower(${table.slug}) and ${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
]);

export const templateTags = pgTable('template_tags', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  dimension: text('dimension').notNull(),
  nameZh: text('name_zh').notNull(),
  nameEn: text('name_en').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: booleanInteger('is_active').notNull().default(1 as unknown as boolean),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
}, (table) => [
  uniqueIndex('template_tags_slug_uidx').on(table.slug),
  index('template_tags_dimension_active_sort_idx').on(table.dimension, table.isActive, table.sortOrder),
  check('template_tags_is_active_check', sql`${table.isActive} in (0, 1)`),
  check('template_tags_dimension_check', sql`${table.dimension} in ('layout', 'style', 'scenario', 'capability', 'paper', 'source', 'export')`),
]);

export const templateTagAliases = pgTable('template_tag_aliases', {
  id: text('id').primaryKey(),
  tagId: text('tag_id').notNull().references(() => templateTags.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
}, (table) => [
  uniqueIndex('template_tag_aliases_locale_normalized_uidx').on(table.locale, table.normalizedAlias),
  index('template_tag_aliases_tag_idx').on(table.tagId),
]);

export const resumeTemplates = pgTable('resume_templates', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  nameZh: text('name_zh').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionZh: text('description_zh').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  categoryId: text('category_id').notNull().references(() => templateCategories.id),
  sourceKind: text('source_kind').notNull(),
  sourceUrl: text('source_url'),
  sourceRevision: text('source_revision'),
  licenseSpdx: text('license_spdx').notNull(),
  licenseUrl: text('license_url').notNull(),
  licenseHash: text('license_hash').notNull(),
  status: text('status').notNull(),
  stableVersionId: text('stable_version_id'),
  searchText: text('search_text').notNull(),
  usageCount: integer('usage_count').notNull().default(0),
  publishedAt: epochTimestamp('published_at'),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  updatedAt: epochTimestamp('updated_at').notNull().default(epochNow),
}, (table): PgTableExtraConfigValue[] => [
  uniqueIndex('resume_templates_slug_uidx').on(table.slug),
  uniqueIndex('resume_templates_id_stable_uidx').on(table.id, table.stableVersionId),
  index('resume_templates_status_category_published_idx').on(table.status, table.categoryId, table.publishedAt, table.id),
  index('resume_templates_status_usage_idx').on(table.status, table.usageCount, table.id),
  check('resume_templates_source_kind_check', sql`${table.sourceKind} in ('native', 'jsonresume', 'reactive-resume', 'other')`),
  check('resume_templates_status_check', sql`${table.status} in ('draft', 'validating', 'published', 'unlisted', 'blocked')`),
  check('resume_templates_usage_count_check', sql`${table.usageCount} >= 0`),
  check('resume_templates_slug_check', sql`${table.slug} = lower(${table.slug}) and ${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  foreignKey({
    columns: [table.id, table.stableVersionId],
    foreignColumns: [resumeTemplateVersions.templateId, resumeTemplateVersions.id],
    name: 'resume_templates_stable_version_fk',
  }),
]);

export const resumeTemplateVersions = pgTable('resume_template_versions', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull().references((): AnyPgColumn => resumeTemplates.id),
  version: text('version').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  rendererKind: text('renderer_kind').notNull(),
  manifest: jsonText('manifest').notNull(),
  manifestHash: text('manifest_hash').notNull(),
  capabilities: jsonText('capabilities').notNull(),
  thumbnailPath: text('thumbnail_path').notNull(),
  previewPath: text('preview_path').notNull(),
  provenance: jsonText('provenance').notNull(),
  status: text('status').notNull(),
  fallbackVersionId: text('fallback_version_id').references((): AnyPgColumn => resumeTemplateVersions.id),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
  publishedAt: epochTimestamp('published_at'),
}, (table): PgTableExtraConfigValue[] => [
  uniqueIndex('resume_template_versions_template_version_uidx').on(table.templateId, table.version),
  unique('resume_template_versions_template_id_id_unique').on(table.templateId, table.id),
  index('resume_template_versions_template_status_version_idx').on(table.templateId, table.status, table.version),
  index('resume_template_versions_manifest_hash_idx').on(table.manifestHash),
  check('resume_template_versions_renderer_kind_check', sql`${table.rendererKind} in ('legacy-react', 'declarative-v1', 'declarative-v2')`),
  check('resume_template_versions_status_check', sql`${table.status} in ('draft', 'published', 'deprecated', 'blocked')`),
  check('resume_template_versions_manifest_hash_check', sql`${table.manifestHash} ~ '^[0-9a-f]{64}$'`),
  check('resume_template_versions_thumbnail_path_check', sql`${table.thumbnailPath} ~ '^templates/[a-z0-9]+(?:-[a-z0-9]+)*/v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)/thumbnail-[0-9a-f]{16}\\.png$'`),
  check('resume_template_versions_preview_path_check', sql`${table.previewPath} ~ '^templates/[a-z0-9]+(?:-[a-z0-9]+)*/v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)/preview-[0-9a-f]{16}\\.png$'`),
  check('resume_template_versions_fallback_check', sql`${table.fallbackVersionId} is null or ${table.fallbackVersionId} <> ${table.id}`),
]);

export const resumeTemplateTags = pgTable('resume_template_tags', {
  templateId: text('template_id').notNull().references(() => resumeTemplates.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => templateTags.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.templateId, table.tagId] }),
  index('resume_template_tags_tag_template_idx').on(table.tagId, table.templateId),
]);

export const templateFavorites = pgTable('template_favorites', {
  userId: text('user_id').notNull(),
  templateId: text('template_id').notNull().references(() => resumeTemplates.id),
  createdAt: epochTimestamp('created_at').notNull().default(epochNow),
}, (table) => [
  primaryKey({ columns: [table.userId, table.templateId] }),
  index('template_favorites_user_created_idx').on(table.userId, table.createdAt, table.templateId),
]);

export const templateRecentUsage = pgTable('template_recent_usage', {
  userId: text('user_id').notNull(),
  templateId: text('template_id').notNull().references(() => resumeTemplates.id),
  lastUsedAt: epochTimestamp('last_used_at').notNull().default(epochNow),
  useCount: integer('use_count').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.userId, table.templateId] }),
  index('template_recent_usage_user_last_used_idx').on(table.userId, table.lastUsedAt, table.templateId),
  check('template_recent_usage_use_count_check', sql`${table.useCount} >= 0`),
]);

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
