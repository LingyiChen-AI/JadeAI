import { db } from './index';
import { resumes, resumeSections } from './schema';

/**
 * Create a sample resume for a new user so the dashboard isn't empty.
 * Uses inline data — does not depend on seed or demo-fingerprint user.
 */
export async function createSampleResume(userId: string) {
  const resumeId = crypto.randomUUID();

  await db.insert(resumes).values({
    id: resumeId,
    userId,
    title: '示例简历 - Sample Resume',
    template: 'modern',
    language: 'zh',
  });

  const sections = [
    {
      type: 'personal_info',
      title: '个人信息',
      sortOrder: 0,
      content: {
        fullName: '陈思远',
        jobTitle: '高级前端工程师',
        email: 'siyuan.chen@example.com',
        phone: '138-0013-8000',
        location: '成都',
        website: 'https://chensiyuan.dev',
      },
    },
    {
      type: 'summary',
      title: '个人简介',
      sortOrder: 1,
      content: {
        text: '拥有 6 年前端开发经验的高级工程师，专注于 React 生态和现代 Web 技术栈。曾主导多个大型 SaaS 产品的前端架构设计与性能优化，将核心页面加载时间缩短 60%。擅长将复杂业务需求转化为优雅的技术方案，对代码质量和用户体验有极高追求。',
      },
    },
    {
      type: 'work_experience',
      title: '工作经历',
      sortOrder: 2,
      content: {
        items: [
          {
            id: crypto.randomUUID(),
            company: '字节跳动',
            position: '高级前端工程师',
            location: '成都',
            startDate: '2022-03',
            endDate: null,
            current: true,
            description: '负责飞书文档协同编辑模块的前端架构设计与核心功能开发。',
            highlights: [
              '主导设计并实现了基于 CRDT 的实时协同编辑引擎，支持万人同时在线编辑',
              '搭建前端性能监控体系，推动核心指标 LCP 从 3.2s 优化至 1.1s',
              '设计组件库的微前端架构方案，实现跨团队组件复用率提升 40%',
            ],
          },
          {
            id: crypto.randomUUID(),
            company: '蚂蚁集团',
            position: '前端工程师',
            location: '杭州',
            startDate: '2019-07',
            endDate: '2022-02',
            current: false,
            description: '参与支付宝小程序平台的开发与维护，负责开发者工具链建设。',
            highlights: [
              '从零搭建小程序 IDE 的插件系统，支持 200+ 第三方插件接入',
              '优化小程序编译流程，构建速度提升 3 倍，显著改善开发者体验',
              '主导前端单元测试覆盖率从 30% 提升至 85%，减少线上故障率 50%',
            ],
          },
          {
            id: crypto.randomUUID(),
            company: '美团',
            position: '前端开发实习生',
            location: '北京',
            startDate: '2018-06',
            endDate: '2019-06',
            current: false,
            description: '参与美团外卖商家端 B 端系统的前端开发。',
            highlights: [
              '独立完成订单管理模块的重构，使用 React Hooks 替换 Class 组件',
              '封装通用表格和表单组件，被团队广泛采用',
            ],
          },
        ],
      },
    },
    {
      type: 'education',
      title: '教育背景',
      sortOrder: 3,
      content: {
        items: [
          {
            id: crypto.randomUUID(),
            institution: '电子科技大学',
            degree: '硕士',
            field: '软件工程',
            location: '成都',
            startDate: '2016-09',
            endDate: '2019-06',
            gpa: '3.8/4.0',
            highlights: ['研究方向：Web 前端性能优化与可视化', '校级优秀毕业论文'],
          },
          {
            id: crypto.randomUUID(),
            institution: '四川大学',
            degree: '学士',
            field: '计算机科学与技术',
            location: '成都',
            startDate: '2012-09',
            endDate: '2016-06',
            gpa: '3.6/4.0',
            highlights: [],
          },
        ],
      },
    },
    {
      type: 'skills',
      title: '技能特长',
      sortOrder: 4,
      content: {
        categories: [
          { id: crypto.randomUUID(), name: '前端框架', skills: ['React', 'Next.js', 'Vue 3', 'TypeScript'] },
          { id: crypto.randomUUID(), name: '工程化', skills: ['Webpack', 'Vite', 'Turborepo', 'CI/CD'] },
          { id: crypto.randomUUID(), name: '其他', skills: ['Node.js', 'Docker', 'PostgreSQL', 'Figma'] },
        ],
      },
    },
    {
      type: 'projects',
      title: '项目经历',
      sortOrder: 5,
      content: {
        items: [
          {
            id: crypto.randomUUID(),
            name: '小逆offer 简历助手',
            url: 'https://github.com/example/jadeai',
            startDate: '2024-10',
            endDate: '2025-02',
            description: '基于 AI 的智能简历生成与优化工具，支持多模板、实时预览和 AI 对话式编辑。',
            technologies: ['Next.js', 'React 19', 'Tailwind CSS', 'Vercel AI SDK'],
            highlights: [
              '使用 AI SDK 实现流式对话与简历内容自动填充',
              '设计三套专业简历模板，支持实时预览与 PDF 导出',
            ],
          },
        ],
      },
    },
    {
      type: 'qr_codes',
      title: '二维码',
      sortOrder: 6,
      content: {
        items: [],
      },
    },
  ];

  for (const section of sections) {
    await db.insert(resumeSections).values({
      id: crypto.randomUUID(),
      resumeId,
      ...section,
    } as any);
  }
}
