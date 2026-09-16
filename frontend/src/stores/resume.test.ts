import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile } from './profile';
import { useResumeStore } from './resume';

function getState() {
  return useResumeStore.getState();
}

function createTestResume(): string {
  return getState().createResume();
}

function getResume(id: string) {
  const resume = getState().resumes.find((item) => item.id === id);
  if (!resume) {
    throw new Error(`resume ${id} not found`);
  }
  return resume;
}

function pastLength(id: string): number {
  return getState().history[id]?.past.length ?? 0;
}

function futureLength(id: string): number {
  return getState().history[id]?.future.length ?? 0;
}

beforeEach(() => {
  useResumeStore.setState({ resumes: [], activeResumeId: null, history: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('撤销与重做', () => {
  it('标题编辑可撤销、可重做', () => {
    const id = createTestResume();
    const originalTitle = getResume(id).title;

    getState().updateResume(id, { title: '应聘增长负责人' });
    expect(getResume(id).title).toBe('应聘增长负责人');

    getState().undoResume(id);
    expect(getResume(id).title).toBe(originalTitle);
    expect(futureLength(id)).toBe(1);

    getState().redoResume(id);
    expect(getResume(id).title).toBe('应聘增长负责人');
    expect(pastLength(id)).toBe(1);
  });

  it('没有历史时撤销/重做是安全的空操作', () => {
    const id = createTestResume();
    const title = getResume(id).title;

    getState().undoResume(id);
    getState().redoResume(id);
    expect(getResume(id).title).toBe(title);
  });

  it('连续输入同一字段合并为一步，撤销一次回到起点', () => {
    const id = createTestResume();
    const originalTitle = getResume(id).title;

    getState().updateResume(id, { title: '产' });
    getState().updateResume(id, { title: '产品' });
    getState().updateResume(id, { title: '产品经理简历' });
    expect(pastLength(id)).toBe(1);

    getState().undoResume(id);
    expect(getResume(id).title).toBe(originalTitle);

    getState().redoResume(id);
    expect(getResume(id).title).toBe('产品经理简历');
  });

  it('基本信息同一字段连续输入合并，不同字段不合并', () => {
    const id = createTestResume();
    const originalName = getResume(id).basicInfo.fullName;

    getState().updateBasicInfo(id, { fullName: '林' });
    getState().updateBasicInfo(id, { fullName: '林小' });
    getState().updateBasicInfo(id, { fullName: '林小北' });
    expect(pastLength(id)).toBe(1);

    getState().updateBasicInfo(id, { phone: '+86 139 0000 0000' });
    expect(pastLength(id)).toBe(2);

    getState().undoResume(id);
    expect(getResume(id).basicInfo.phone).not.toBe('+86 139 0000 0000');
    getState().undoResume(id);
    expect(getResume(id).basicInfo.fullName).toBe(originalName);
  });

  it('不同字段的连续编辑不合并', () => {
    const id = createTestResume();

    getState().updateResume(id, { title: '新标题' });
    getState().updateResume(id, { summary: '新摘要' });
    expect(pastLength(id)).toBe(2);
  });

  it('撤销后再编辑会清空重做分支', () => {
    const id = createTestResume();

    getState().updateResume(id, { title: '版本 A' });
    getState().undoResume(id);
    expect(futureLength(id)).toBe(1);

    getState().updateResume(id, { title: '版本 B' });
    expect(futureLength(id)).toBe(0);

    getState().redoResume(id);
    expect(getResume(id).title).toBe('版本 B');
  });

  it('撤销-重做后继续输入同一字段仍按原合并键合并', () => {
    const id = createTestResume();
    const originalTitle = getResume(id).title;

    getState().updateResume(id, { title: '甲' });
    getState().undoResume(id);
    getState().redoResume(id);
    getState().updateResume(id, { title: '甲乙' });

    expect(pastLength(id)).toBe(1);
    getState().undoResume(id);
    expect(getResume(id).title).toBe(originalTitle);
  });

  it('无实际内容变化的编辑不产生历史', () => {
    const id = createTestResume();
    const title = getResume(id).title;

    getState().updateResume(id, { title });
    getState().updateBasicInfo(id, { fullName: getResume(id).basicInfo.fullName });
    expect(getState().history[id]).toBeUndefined();
  });

  it('历史步数有上限', () => {
    const id = createTestResume();
    for (let count = 0; count < 120; count += 1) {
      getState().toggleSection(id, 'work');
    }
    expect(pastLength(id)).toBe(100);
  });
});

describe('经历条目与模块', () => {
  it('同一条目同一字段的连续编辑合并为一步', () => {
    const id = createTestResume();
    const workId = getResume(id).workExperiences[0].id;
    const originalCompany = getResume(id).workExperiences[0].companyName;

    const rename = (companyName: string) =>
      getState().updateResume(id, {
        workExperiences: getResume(id).workExperiences.map((work) =>
          work.id === workId ? { ...work, companyName } : work,
        ),
      });

    rename('甲');
    rename('甲公司');
    expect(pastLength(id)).toBe(1);

    getState().undoResume(id);
    expect(getResume(id).workExperiences[0].companyName).toBe(originalCompany);
  });

  it('不同条目的编辑不合并', () => {
    const id = createTestResume();
    const [first, second] = getResume(id).workExperiences;

    const rename = (workId: string, companyName: string) =>
      getState().updateResume(id, {
        workExperiences: getResume(id).workExperiences.map((work) =>
          work.id === workId ? { ...work, companyName } : work,
        ),
      });

    rename(first.id, '甲公司');
    rename(second.id, '乙公司');
    expect(pastLength(id)).toBe(2);
  });

  it('条目增删是独立步骤，不与字段编辑合并', () => {
    const id = createTestResume();
    const workId = getResume(id).workExperiences[0].id;

    getState().updateResume(id, {
      workExperiences: getResume(id).workExperiences.map((work) =>
        work.id === workId ? { ...work, companyName: '甲公司' } : work,
      ),
    });
    getState().updateResume(id, {
      workExperiences: [
        ...getResume(id).workExperiences,
        {
          id: 'work_new',
          companyName: '新公司',
          position: '职位',
          startDate: '',
          endDate: '',
          responsibilities: [],
          achievements: [],
        },
      ],
    });
    expect(pastLength(id)).toBe(2);

    getState().undoResume(id);
    expect(getResume(id).workExperiences).toHaveLength(2);
    getState().undoResume(id);
    expect(getResume(id).workExperiences[0].companyName).not.toBe('甲公司');
  });

  it('删除条目可撤销恢复', () => {
    const id = createTestResume();
    const before = getResume(id).workExperiences;

    getState().updateResume(id, { workExperiences: before.filter((work) => work.id !== before[0].id) });
    expect(getResume(id).workExperiences).toHaveLength(before.length - 1);

    getState().undoResume(id);
    expect(getResume(id).workExperiences.map((work) => work.id)).toEqual(before.map((work) => work.id));
  });

  it('模块排序与启停可撤销', () => {
    const id = createTestResume();
    const originalOrder = getResume(id).sections.map((section) => section.id);
    const reversed = [...originalOrder].reverse();

    getState().reorderSections(id, reversed);
    expect(getResume(id).sections.map((section) => section.id)).toEqual(reversed);

    getState().toggleSection(id, 'skills');
    expect(getResume(id).sections.find((section) => section.id === 'skills')?.enabled).toBe(false);

    getState().undoResume(id);
    expect(getResume(id).sections.find((section) => section.id === 'skills')?.enabled).toBe(true);
    expect(getResume(id).sections.map((section) => section.id)).toEqual(reversed);

    getState().undoResume(id);
    expect(getResume(id).sections.map((section) => section.id)).toEqual(originalOrder);
  });

  it('模板切换可撤销', () => {
    const id = createTestResume();
    const originalTemplate = getResume(id).templateId;

    getState().updateResume(id, { templateId: 'executive' });
    expect(getResume(id).templateId).toBe('executive');

    getState().undoResume(id);
    expect(getResume(id).templateId).toBe(originalTemplate);
  });
});

describe('同步资料', () => {
  it('同步资料只产生一步历史，一次撤销全部还原', () => {
    const id = createTestResume();
    const originalBasicInfo = getResume(id).basicInfo;
    const originalSummary = getResume(id).summary;

    getState().syncProfileToResume(id, defaultProfile);
    expect(getResume(id).basicInfo.website).toBe(defaultProfile.website);
    expect(getResume(id).summary).toBe(defaultProfile.summary);
    expect(pastLength(id)).toBe(1);

    getState().undoResume(id);
    expect(getResume(id).basicInfo).toEqual(originalBasicInfo);
    expect(getResume(id).summary).toBe(originalSummary);
  });
});

describe('历史按简历隔离', () => {
  it('各简历的撤销/重做状态互不影响', () => {
    const a = createTestResume();
    const b = createTestResume();

    getState().updateResume(a, { title: 'A 版本' });
    getState().updateResume(b, { title: 'B 版本' });
    expect(pastLength(a)).toBe(1);
    expect(pastLength(b)).toBe(1);

    getState().undoResume(a);
    expect(getResume(a).title).toBe('新简历 1');
    expect(getResume(b).title).toBe('B 版本');
    expect(futureLength(a)).toBe(1);
    expect(futureLength(b)).toBe(0);

    getState().redoResume(a);
    expect(getResume(a).title).toBe('A 版本');
    expect(pastLength(b)).toBe(1);
  });

  it('新建简历的历史从空开始', () => {
    const a = createTestResume();
    getState().updateResume(a, { title: 'A 版本' });

    const b = createTestResume();
    expect(pastLength(b)).toBe(0);
    expect(futureLength(b)).toBe(0);
  });

  it('复制简历不继承源简历的历史', () => {
    const a = createTestResume();
    getState().updateResume(a, { title: 'A 版本' });

    const cloneId = getState().duplicateResume(a);
    expect(cloneId).toBeTruthy();
    expect(pastLength(cloneId as string)).toBe(0);
    expect(pastLength(a)).toBe(1);
  });

  it('删除简历会移除其历史，不影响其他简历', () => {
    const a = createTestResume();
    const b = createTestResume();
    getState().updateResume(a, { title: 'A 版本' });
    getState().updateResume(b, { title: 'B 版本' });

    getState().deleteResume(a);
    expect(getState().history[a]).toBeUndefined();
    expect(getState().resumes.some((resume) => resume.id === a)).toBe(false);

    expect(pastLength(b)).toBe(1);
    getState().undoResume(b);
    expect(getResume(b).title).toBe('新简历 2');
  });

  it('恢复工作区（replaceResumes）会清空全部历史', () => {
    const a = createTestResume();
    const b = createTestResume();
    getState().updateResume(a, { title: 'A 版本' });
    getState().updateResume(b, { title: 'B 版本' });

    const snapshot = getResume(a);
    getState().replaceResumes([snapshot], snapshot.id);

    expect(getState().history).toEqual({});
    getState().undoResume(a);
    expect(getResume(a).title).toBe('A 版本');
  });
});

describe('跨简历切换与合并', () => {
  it('切走再切回后，同一字段的修改不与切换前的编辑合并', () => {
    const a = createTestResume();
    const b = createTestResume();
    const originalTitle = getResume(a).title;

    getState().setActiveResume(a);
    getState().updateResume(a, { title: '切换前' });
    getState().setActiveResume(b);
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '切换后' });

    expect(pastLength(a)).toBe(2);
    getState().undoResume(a);
    expect(getResume(a).title).toBe('切换前');
    getState().undoResume(a);
    expect(getResume(a).title).toBe(originalTitle);
  });

  it('基本信息字段切走再切回后同样不合并', () => {
    const a = createTestResume();
    const b = createTestResume();

    getState().setActiveResume(a);
    getState().updateBasicInfo(a, { fullName: '改前' });
    getState().setActiveResume(b);
    getState().setActiveResume(a);
    getState().updateBasicInfo(a, { fullName: '改后' });

    expect(pastLength(a)).toBe(2);
    getState().undoResume(a);
    expect(getResume(a).basicInfo.fullName).toBe('改前');
  });

  it('编辑器用同一 id 重复调用 setActiveResume 不会打断连续输入合并', () => {
    const a = createTestResume();

    getState().setActiveResume(a);
    getState().updateResume(a, { title: '甲' });
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '甲乙' });
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '甲乙丙' });

    expect(pastLength(a)).toBe(1);
    getState().undoResume(a);
    expect(getResume(a).title).toBe('新简历 1');
  });

  it('新建简历切走活动简历后，回到原简历的同字段修改不合并', () => {
    const a = createTestResume();

    getState().setActiveResume(a);
    getState().updateResume(a, { title: '旧' });
    createTestResume();
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '新' });

    expect(pastLength(a)).toBe(2);
    getState().undoResume(a);
    expect(getResume(a).title).toBe('旧');
  });

  it('复制简历切走活动简历后，回到原简历的同字段修改不合并', () => {
    const a = createTestResume();

    getState().setActiveResume(a);
    getState().updateResume(a, { title: '旧' });
    getState().duplicateResume(a);
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '新' });

    expect(pastLength(a)).toBe(2);
  });

  it('封存合并键不影响撤销/重做状态与数据', () => {
    const a = createTestResume();
    const b = createTestResume();

    getState().setActiveResume(a);
    getState().updateResume(a, { title: '切换前' });
    getState().setActiveResume(b);
    getState().setActiveResume(a);
    getState().updateResume(a, { title: '切换后' });

    getState().undoResume(a);
    expect(getResume(a).title).toBe('切换前');
    expect(futureLength(a)).toBe(1);
    getState().redoResume(a);
    expect(getResume(a).title).toBe('切换后');
    expect(pastLength(a)).toBe(2);
    expect(pastLength(b)).toBe(0);
    expect(futureLength(b)).toBe(0);
  });
});

describe('持久化', () => {
  it('编辑、撤销与重做的结果都会写入 localStorage', () => {
    const storage: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = String(value);
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
    });

    const id = createTestResume();
    getState().updateResume(id, { title: '持久化标题' });
    getState().undoResume(id);

    const persisted = JSON.parse(storage['smart-resume:resumes']) as Array<{ id: string; title: string }>;
    expect(persisted.find((resume) => resume.id === id)?.title).toBe('新简历 1');

    getState().redoResume(id);
    const repersisted = JSON.parse(storage['smart-resume:resumes']) as Array<{ id: string; title: string }>;
    expect(repersisted.find((resume) => resume.id === id)?.title).toBe('持久化标题');
  });
});
