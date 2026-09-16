import { create } from 'zustand';
import { EducationLevel, SkillCategory, SkillLevel } from '../types/enums';
import { Profile } from '../types/profile';
import { Resume, ResumeBasicInfo, ResumeSection, ResumeSectionType } from '../types/resume';
import { createId } from '../utils/format';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';
import { useTemplateStore } from './template';

const defaultSections: ResumeSection[] = [
  { id: 'summary', title: '职业摘要', enabled: true },
  { id: 'work', title: '工作经历', enabled: true },
  { id: 'projects', title: '项目经历', enabled: true },
  { id: 'skills', title: '技能矩阵', enabled: true },
  { id: 'education', title: '教育经历', enabled: true },
];

const defaultBasicInfo: ResumeBasicInfo = {
  fullName: '林知远',
  headline: '增长产品经理 / AI 工具策划',
  phone: '+86 138 0000 2831',
  email: 'lin.resume@example.com',
  location: '上海',
  website: 'portfolio.example.com',
  avatarUrl: '',
};

function buildResume(templateId = 'atelier', title = '我的智能简历'): Resume {
  const now = new Date().toISOString();

  return {
    id: createId('resume'),
    title,
    templateId,
    createdAt: now,
    updatedAt: now,
    basicInfo: defaultBasicInfo,
    summary:
      '8 年产品与增长经验，曾从 0 到 1 搭建多端内容生产工具，擅长用数据识别业务瓶颈并组织跨团队交付。',
    sections: defaultSections,
    workExperiences: [
      {
        id: createId('work'),
        companyName: '青松科技',
        position: '高级产品经理',
        startDate: '2021.06',
        endDate: '至今',
        responsibilities: ['负责 AI 内容工作台的规划、验证与迭代节奏', '组织设计、算法、工程和增长团队共创核心工作流'],
        achievements: ['核心编辑链路转化率提升 32%', '将简历生成任务平均耗时从 42 分钟降至 11 分钟'],
      },
      {
        id: createId('work'),
        companyName: '云岭数据',
        position: '增长产品经理',
        startDate: '2018.03',
        endDate: '2021.05',
        responsibilities: ['搭建用户分层运营模型', '推进看板、实验平台和增长活动配置化'],
        achievements: ['季度留存提升 18%', '实验上线周期缩短 45%'],
      },
    ],
    educations: [
      {
        id: createId('edu'),
        school: '华东理工大学',
        major: '信息管理与信息系统',
        level: EducationLevel.Bachelor,
        startDate: '2013.09',
        endDate: '2017.06',
        gpa: '3.7 / 4.0',
        honors: ['优秀毕业生', '校级创新项目一等奖'],
      },
    ],
    skills: [
      { id: createId('skill'), name: '产品策略', level: SkillLevel.Expert, proficiency: 5, category: SkillCategory.Soft },
      { id: createId('skill'), name: 'A/B Testing', level: SkillLevel.Advanced, proficiency: 4, category: SkillCategory.Technology },
      { id: createId('skill'), name: 'SQL / 数据分析', level: SkillLevel.Advanced, proficiency: 4, category: SkillCategory.Technology },
      { id: createId('skill'), name: '英语沟通', level: SkillLevel.Intermediate, proficiency: 3, category: SkillCategory.Language },
    ],
    projects: [
      {
        id: createId('project'),
        name: 'AI 简历诊断引擎',
        role: '产品负责人',
        startDate: '2023.11',
        endDate: '2024.08',
        techStack: ['React', 'LLM Workflow', 'Embedding', 'Analytics'],
        description: '为求职者提供结构化简历评分、岗位匹配建议和改写建议。',
        outcomes: ['首月完成 4.6 万份简历诊断', '付费转化率较旧版提升 21%'],
      },
    ],
  };
}

const storedResumes = readStorage<Resume[]>(storageKeys.resumes, []);
const initialResumes = storedResumes.length > 0 ? storedResumes : [buildResume('atelier', '产品经理求职简历')];
const initialActiveResumeId = readStorage<string | null>(storageKeys.activeResumeId, initialResumes[0]?.id ?? null);

function persist(state: Pick<ResumeState, 'resumes' | 'activeResumeId'>): void {
  writeStorage(storageKeys.resumes, state.resumes);
  writeStorage(storageKeys.activeResumeId, state.activeResumeId);
}

const HISTORY_LIMIT = 100;

interface HistoryEntry {
  /** 该步编辑之前的简历快照 */
  snapshot: Resume;
  /** 可合并编辑的标识；null 表示不可合并的离散操作（模板切换、模块排序等） */
  mergeKey: string | null;
}

interface ResumeHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

type ResumeContentKey =
  | 'title'
  | 'templateId'
  | 'basicInfo'
  | 'summary'
  | 'sections'
  | 'workExperiences'
  | 'educations'
  | 'skills'
  | 'projects';

const contentKeys: ResumeContentKey[] = [
  'title',
  'templateId',
  'basicInfo',
  'summary',
  'sections',
  'workExperiences',
  'educations',
  'skills',
  'projects',
];

const listKeys = ['workExperiences', 'educations', 'skills', 'projects'] as const;
type ResumeListKey = (typeof listKeys)[number];

function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 条目列表编辑的合并键：仅当恰好一个条目的一个字段被修改时返回
 * `列表键.条目id.字段名`，其余情况（增删、排序、批量修改）不可合并。
 */
function deriveListMergeKey(
  key: ResumeListKey,
  prevItems: Array<{ id: string }>,
  nextItems: Array<{ id: string }>,
): string | null {
  if (prevItems.length !== nextItems.length) {
    return null;
  }

  let changedBefore: Record<string, unknown> | null = null;
  let changedAfter: Record<string, unknown> | null = null;
  for (let index = 0; index < prevItems.length; index += 1) {
    if (prevItems[index] === nextItems[index]) {
      continue;
    }
    if (prevItems[index].id !== nextItems[index].id || changedBefore !== null) {
      return null;
    }
    changedBefore = prevItems[index] as Record<string, unknown>;
    changedAfter = nextItems[index] as Record<string, unknown>;
  }

  if (!changedBefore || !changedAfter) {
    return null;
  }
  const before = changedBefore;
  const after = changedAfter;
  const changedFields = Object.keys(after).filter((field) => !isSameValue(before[field], after[field]));
  if (changedFields.length !== 1) {
    return null;
  }
  return `${key}.${String(after.id)}.${changedFields[0]}`;
}

/**
 * 根据编辑前后的简历推导合并键。只有单一文本类字段的连续修改才可合并；
 * 模板切换、模块排序/启停、条目增删等离散操作返回 null，各自成为独立历史步。
 */
function deriveMergeKey(prev: Resume, next: Resume): string | null {
  const changedKeys = contentKeys.filter((key) => !isSameValue(prev[key], next[key]));
  if (changedKeys.length !== 1) {
    return null;
  }

  const key = changedKeys[0];
  if (key === 'title' || key === 'summary') {
    return key;
  }
  if (key === 'basicInfo') {
    const changedFields = (Object.keys(next.basicInfo) as (keyof ResumeBasicInfo)[]).filter(
      (field) => !isSameValue(prev.basicInfo[field], next.basicInfo[field]),
    );
    return changedFields.length === 1 ? `basicInfo.${String(changedFields[0])}` : null;
  }
  if ((listKeys as readonly string[]).includes(key)) {
    const listKey = key as ResumeListKey;
    return deriveListMergeKey(listKey, prev[listKey], next[listKey]);
  }
  return null;
}

/** 记录一步历史；与栈顶合并键相同的连续编辑会被合并，且任何新编辑都会清空重做分支。 */
function recordHistory(history: ResumeHistory | undefined, snapshot: Resume, mergeKey: string | null): ResumeHistory {
  const past = history?.past ?? [];
  const top = past[past.length - 1];
  const canMerge = mergeKey !== null && top !== undefined && top.mergeKey === mergeKey;
  const nextPast = canMerge ? past : [...past, { snapshot, mergeKey }].slice(-HISTORY_LIMIT);
  return { past: nextPast, future: [] };
}

/** 应用一次简历内容编辑：更新数据、记录历史；无实际内容变化时不产生历史步。 */
function applyResumeChange(
  state: Pick<ResumeState, 'resumes' | 'history'>,
  resumeId: string,
  change: (resume: Resume) => Resume,
): Pick<ResumeState, 'resumes' | 'history'> {
  const resume = state.resumes.find((item) => item.id === resumeId);
  if (!resume) {
    return { resumes: state.resumes, history: state.history };
  }

  const nextResume: Resume = { ...change(resume), updatedAt: new Date().toISOString() };
  const resumes = state.resumes.map((item) => (item.id === resumeId ? nextResume : item));
  const changed = contentKeys.some((key) => !isSameValue(resume[key], nextResume[key]));
  if (!changed) {
    return { resumes, history: state.history };
  }

  const mergeKey = deriveMergeKey(resume, nextResume);
  return {
    resumes,
    history: { ...state.history, [resumeId]: recordHistory(state.history[resumeId], resume, mergeKey) },
  };
}

interface ResumeState {
  resumes: Resume[];
  activeResumeId: string | null;
  /** 撤销/重做历史，按简历 id 隔离，仅保存在内存中 */
  history: Record<string, ResumeHistory>;
  createResume: () => string;
  duplicateResume: (resumeId: string) => string | null;
  deleteResume: (resumeId: string) => void;
  setActiveResume: (resumeId: string | null) => void;
  updateResume: (resumeId: string, patch: Partial<Resume>) => void;
  updateBasicInfo: (resumeId: string, patch: Partial<ResumeBasicInfo>) => void;
  reorderSections: (resumeId: string, sectionIds: ResumeSectionType[]) => void;
  toggleSection: (resumeId: string, sectionId: ResumeSectionType) => void;
  syncProfileToResume: (resumeId: string, profile: Profile) => void;
  undoResume: (resumeId: string) => void;
  redoResume: (resumeId: string) => void;
  replaceResumes: (resumes: Resume[], activeResumeId?: string | null) => void;
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  resumes: initialResumes,
  activeResumeId: initialActiveResumeId,
  history: {},
  createResume: () => {
    const selectedTemplateId = useTemplateStore.getState().selectedTemplateId;
    const resume = buildResume(selectedTemplateId, `新简历 ${get().resumes.length + 1}`);
    // 新简历的历史从空开始，基于当前数据重新建立
    set((state) => ({
      resumes: [resume, ...state.resumes],
      activeResumeId: resume.id,
    }));
    persist(get());
    return resume.id;
  },
  duplicateResume: (resumeId) => {
    const source = get().resumes.find((resume) => resume.id === resumeId);
    if (!source) {
      return null;
    }

    const now = new Date().toISOString();
    const clone: Resume = {
      ...source,
      id: createId('resume'),
      title: `${source.title} 副本`,
      createdAt: now,
      updatedAt: now,
      workExperiences: source.workExperiences.map((item) => ({ ...item, id: createId('work') })),
      educations: source.educations.map((item) => ({ ...item, id: createId('edu') })),
      skills: source.skills.map((item) => ({ ...item, id: createId('skill') })),
      projects: source.projects.map((item) => ({ ...item, id: createId('project') })),
    };

    // 副本是全新简历，不继承源简历的历史
    set((state) => ({
      resumes: [clone, ...state.resumes],
      activeResumeId: clone.id,
    }));
    persist(get());
    return clone.id;
  },
  deleteResume: (resumeId) => {
    set((state) => {
      const nextResumes = state.resumes.filter((resume) => resume.id !== resumeId);
      const activeResumeId =
        state.activeResumeId === resumeId ? nextResumes[0]?.id ?? null : state.activeResumeId;
      // 同步移除该简历的历史，避免已移除内容被后续撤销带回
      const nextHistory = { ...state.history };
      delete nextHistory[resumeId];
      return { resumes: nextResumes, activeResumeId, history: nextHistory };
    });
    persist(get());
  },
  setActiveResume: (resumeId) => {
    set({ activeResumeId: resumeId });
    persist(get());
  },
  updateResume: (resumeId, patch) => {
    set((state) => applyResumeChange(state, resumeId, (resume) => ({ ...resume, ...patch })));
    persist(get());
  },
  updateBasicInfo: (resumeId, patch) => {
    set((state) =>
      applyResumeChange(state, resumeId, (resume) => ({
        ...resume,
        basicInfo: { ...resume.basicInfo, ...patch },
      })),
    );
    persist(get());
  },
  reorderSections: (resumeId, sectionIds) => {
    set((state) =>
      applyResumeChange(state, resumeId, (resume) => ({
        ...resume,
        sections: sectionIds
          .map((sectionId) => resume.sections.find((section) => section.id === sectionId))
          .filter((section): section is ResumeSection => Boolean(section)),
      })),
    );
    persist(get());
  },
  toggleSection: (resumeId, sectionId) => {
    set((state) =>
      applyResumeChange(state, resumeId, (resume) => ({
        ...resume,
        sections: resume.sections.map((section) =>
          section.id === sectionId ? { ...section, enabled: !section.enabled } : section,
        ),
      })),
    );
    persist(get());
  },
  syncProfileToResume: (resumeId, profile) => {
    // 基本信息与摘要一次性写入，保证同步资料只产生一步历史
    set((state) =>
      applyResumeChange(state, resumeId, (resume) => ({
        ...resume,
        basicInfo: {
          ...resume.basicInfo,
          fullName: profile.fullName,
          headline: profile.headline,
          phone: profile.phone,
          email: profile.email,
          location: profile.location,
          website: profile.website,
          avatarUrl: profile.avatarUrl,
        },
        summary: profile.summary,
      })),
    );
    persist(get());
  },
  undoResume: (resumeId) => {
    const { history, resumes } = get();
    const stack = history[resumeId];
    const current = resumes.find((resume) => resume.id === resumeId);
    if (!stack || stack.past.length === 0 || !current) {
      return;
    }

    const entry = stack.past[stack.past.length - 1];
    const restored: Resume = { ...entry.snapshot, updatedAt: new Date().toISOString() };
    set((state) => ({
      resumes: state.resumes.map((resume) => (resume.id === resumeId ? restored : resume)),
      history: {
        ...state.history,
        [resumeId]: {
          past: stack.past.slice(0, -1),
          future: [...stack.future, { snapshot: current, mergeKey: entry.mergeKey }],
        },
      },
    }));
    persist(get());
  },
  redoResume: (resumeId) => {
    const { history, resumes } = get();
    const stack = history[resumeId];
    const current = resumes.find((resume) => resume.id === resumeId);
    if (!stack || stack.future.length === 0 || !current) {
      return;
    }

    const entry = stack.future[stack.future.length - 1];
    const restored: Resume = { ...entry.snapshot, updatedAt: new Date().toISOString() };
    set((state) => ({
      resumes: state.resumes.map((resume) => (resume.id === resumeId ? restored : resume)),
      history: {
        ...state.history,
        [resumeId]: {
          past: [...stack.past, { snapshot: current, mergeKey: entry.mergeKey }],
          future: stack.future.slice(0, -1),
        },
      },
    }));
    persist(get());
  },
  replaceResumes: (resumes, activeResumeId) => {
    // 工作区被整体替换（如导入恢复），历史按当前数据全部重建
    set({ resumes, activeResumeId: activeResumeId ?? resumes[0]?.id ?? null, history: {} });
    persist(get());
  },
}));
