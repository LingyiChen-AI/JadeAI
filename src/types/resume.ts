export interface QrCodeItem {
  id: string;
  label: string;
  url: string;
}

export interface PersonalInfoContent {
  fullName: string;
  jobTitle: string;
  age?: string;
  gender?: string;
  politicalStatus?: string;
  ethnicity?: string;
  hometown?: string;
  maritalStatus?: string;
  yearsOfExperience?: string;
  educationLevel?: string;
  email: string;
  phone: string;
  wechat?: string;
  location: string;
  website?: string;
  linkedin?: string;
  github?: string;
  customLinks?: { label: string; url: string }[];
  avatar?: string;
}

export interface QrCodesContent {
  items: QrCodeItem[];
}

export interface SummaryContent {
  text: string;
}

export interface WorkExperienceItem {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string;
  technologies: string[];
  highlights: string[];
}

export interface WorkExperienceContent {
  items: WorkExperienceItem[];
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location?: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  highlights: string[];
}

export interface EducationContent {
  items: EducationItem[];
}

export interface SkillCategory {
  id: string;
  name: string;
  skills: string[];
}

export interface SkillsContent {
  categories: SkillCategory[];
}

export interface ProjectItem {
  id: string;
  name: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description: string;
  technologies: string[];
  highlights: string[];
}

export interface ProjectsContent {
  items: ProjectItem[];
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

export interface CertificationsContent {
  items: CertificationItem[];
}

export interface LanguageItem {
  id: string;
  language: string;
  proficiency: string;
  description?: string;
}

export interface LanguagesContent {
  items: LanguageItem[];
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle?: string;
  date?: string;
  description: string;
}

export interface CustomContent {
  items: CustomItem[];
}

export interface GitHubRepoItem {
  id: string;
  repoUrl: string;
  name: string;
  stars: number;
  language: string;
  description: string;
}

export interface GitHubContent {
  items: GitHubRepoItem[];
}

export type SectionContent =
  | PersonalInfoContent
  | SummaryContent
  | WorkExperienceContent
  | EducationContent
  | SkillsContent
  | ProjectsContent
  | CertificationsContent
  | LanguagesContent
  | CustomContent
  | GitHubContent
  | QrCodesContent;

export interface ResumeSection {
  id: string;
  resumeId: string;
  type: string;
  title: string;
  sortOrder: number;
  visible: boolean;
  content: SectionContent;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: string;
  lineSpacing: number;
  margin: { top: number; right: number; bottom: number; left: number };
  sectionSpacing: number;
  avatarStyle?: 'circle' | 'oneInch';
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  template: string;
  themeConfig: ThemeConfig;
  isDefault: boolean;
  language: string;
  revision: number;
  templateVersionId: string | null;
  templateSource: 'legacy' | 'public' | 'local-snapshot';
  templateSnapshot: import('./template').TemplateSnapshot | null;
  resolvedTemplate?: import('../lib/templates/resolve-template').ResolvedTemplate;
  sections: ResumeSection[];
  createdAt: Date;
  updatedAt: Date;
}
