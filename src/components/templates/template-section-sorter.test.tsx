/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { TemplateManifestV1 } from '@/types/template';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { TemplateSectionSorter, createTemplateSectionAnnouncements, reorderTemplateSlots } from './template-section-sorter';

const slots: TemplateManifestV1['sectionSlots'] = [
  { sectionType: 'personal_info', placement: 'header', order: 4 },
  { sectionType: 'summary', placement: 'main', order: 9 },
  { sectionType: 'skills', placement: 'sidebar', order: 12 },
];
const announcementLabels = {
  dragHandle: (section: string) => `Drag ${section}`,
  moveUp: (section: string) => `Move ${section} up`,
  moveDown: (section: string) => `Move ${section} down`,
  placement: (section: string) => `Placement ${section}`,
  advanced: 'Advanced',
  placements: { header: 'Header', main: 'Main', sidebar: 'Sidebar', footer: 'Footer' },
  dragStart: (section: string) => `Start ${section}`,
  dragOver: (section: string, over: string) => `${section} over ${over}`,
  dragEnd: (section: string, over: string) => `End ${section} over ${over}`,
  dragCancel: (section: string) => `Cancel ${section}`,
};

afterEach(cleanup);

describe('reorderTemplateSlots', () => {
  test('returns null when drag is cancelled or targets the same slot', () => {
    expect(reorderTemplateSlots(slots, 'summary', null)).toBeNull();
    expect(reorderTemplateSlots(slots, 'summary', 'summary')).toBeNull();
  });

  test('moves a slot and normalizes all orders to a contiguous sequence', () => {
    expect(reorderTemplateSlots(slots, 'skills', 'personal_info')).toEqual([
      { sectionType: 'skills', placement: 'sidebar', order: 0 },
      { sectionType: 'personal_info', placement: 'header', order: 1 },
      { sectionType: 'summary', placement: 'main', order: 2 },
    ]);
  });
});

describe('TemplateSectionSorter', () => {
  test('builds every drag announcement from localized action labels', () => {
    const labels = {
      dragHandle: (section: string) => `拖动${section}`,
      moveUp: (section: string) => `上移${section}`,
      moveDown: (section: string) => `下移${section}`,
      placement: (section: string) => `位置${section}`,
      advanced: '高级设置',
      placements: { header: '页首', main: '主栏', sidebar: '侧栏', footer: '页尾' },
      dragStart: (section: string) => `开始拖动 ${section}`,
      dragOver: (section: string, over: string) => `${section} 位于 ${over} 上方`,
      dragEnd: (section: string, over: string) => `已将 ${section} 放到 ${over}`,
      dragCancel: (section: string) => `取消拖动 ${section}`,
    };
    const announcements = createTemplateSectionAnnouncements(labels, (id) => ({ summary: '简介', skills: '技能' }[id] ?? id));
    expect(announcements.onDragStart({ active: { id: 'summary' } })).toBe('开始拖动 简介');
    expect(announcements.onDragOver({ active: { id: 'summary' }, over: { id: 'skills' } })).toBe('简介 位于 技能 上方');
    expect(announcements.onDragOver({ active: { id: 'summary' }, over: null })).toBe('取消拖动 简介');
    expect(announcements.onDragEnd({ active: { id: 'summary' }, over: { id: 'skills' } })).toBe('已将 简介 放到 技能');
    expect(announcements.onDragCancel({ active: { id: 'summary' } })).toBe('取消拖动 简介');
  });

  test('supports duplicate section types with row-local identity and updates only the target row', () => {
    const duplicateSlots: TemplateManifestV1['sectionSlots'] = [
      { sectionType: 'summary', placement: 'main', order: 0 },
      { sectionType: 'summary', placement: 'sidebar', order: 1 },
    ];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onChange = vi.fn();
    render(<TemplateSectionSorter slots={duplicateSlots} onChange={onChange} labels={announcementLabels} />);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('duplicate key'));
    fireEvent.change(screen.getAllByRole('combobox', { name: /placement summary/i })[1], { target: { value: 'footer' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { sectionType: 'summary', placement: 'main', order: 0 },
      { sectionType: 'summary', placement: 'footer', order: 1 },
    ]);
    error.mockRestore();
  });

  test('does not fall back to advancedContent when advancedRenderer explicitly returns null', () => {
    render(<TemplateSectionSorter slots={slots} onChange={vi.fn()} labels={announcementLabels} advancedRenderer={() => null} advancedContent={<span>Fallback</span>} />);
    expect(screen.queryByText('Fallback')).toBeNull();
  });

  test('renders accessible move controls, placement fields, and advanced content', () => {
    render(
      <TemplateSectionSorter
        slots={slots}
        onChange={vi.fn()}
        labels={announcementLabels}
        advancedRenderer={(slot) => <span>Advanced {slot.sectionType}</span>}
      />,
    );

    expect(screen.getByRole('button', { name: /move personal_info up/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /move skills down/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('combobox', { name: /placement personal_info/i })).toHaveProperty('value', 'header');
    expect(screen.getByText('Advanced summary')).toBeTruthy();
  });

  test('uses localized visible and aria labels for row controls and placement options', () => {
    const zh = { ...announcementLabels, dragHandle: (s: string) => `拖动${s}`, moveUp: (s: string) => `上移${s}`, moveDown: (s: string) => `下移${s}`, placement: (s: string) => `位置${s}`, advanced: '高级设置', placements: { header: '页首', main: '主栏', sidebar: '侧栏', footer: '页尾' } };
    render(<TemplateSectionSorter slots={slots} onChange={vi.fn()} labels={zh} sectionLabels={{ personal_info: '个人信息', summary: '简介', skills: '技能' }} advancedContent={<span />} />);
    expect(screen.getByRole('button', { name: '拖动个人信息' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '上移个人信息' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '下移个人信息' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '位置个人信息' }).textContent).toContain('页首');
    expect(screen.getAllByText('高级设置')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('personal_info');
  });

  test('moves with arrow controls and updates placement through its callback', () => {
    const onChange = vi.fn();
    render(<TemplateSectionSorter slots={slots} onChange={onChange} labels={announcementLabels} />);

    fireEvent.click(screen.getByRole('button', { name: /move skills up/i }));
    expect(onChange).toHaveBeenLastCalledWith([
      { sectionType: 'personal_info', placement: 'header', order: 0 },
      { sectionType: 'skills', placement: 'sidebar', order: 1 },
      { sectionType: 'summary', placement: 'main', order: 2 },
    ]);

    fireEvent.change(screen.getByRole('combobox', { name: /placement summary/i }), { target: { value: 'footer' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { sectionType: 'personal_info', placement: 'header', order: 4 },
      { sectionType: 'summary', placement: 'footer', order: 9 },
      { sectionType: 'skills', placement: 'sidebar', order: 12 },
    ]);
  });

  test('keeps focused row controls and open advanced state through a controlled reorder', () => {
    const duplicateSlots: TemplateManifestV1['sectionSlots'] = [
      { sectionType: 'summary', placement: 'main', order: 0 },
      { sectionType: 'summary', placement: 'sidebar', order: 1 },
    ];
    function Harness() {
      const [value, setValue] = useState(duplicateSlots);
      return <TemplateSectionSorter slots={value} onChange={(next) => setValue(structuredClone(next))} labels={announcementLabels} advancedRenderer={(slot) => <span>Advanced {slot.sectionType} {slot.placement}</span>} />;
    }
    render(<Harness />);
    const summaryDetails = screen.getByText('Advanced summary sidebar').closest('details')!;
    fireEvent.click(summaryDetails.querySelector('summary')!);
    expect(summaryDetails).toHaveProperty('open', true);
    const moveUp = screen.getAllByRole('button', { name: /move summary up/i })[1];
    moveUp.focus();
    fireEvent.click(moveUp);
    expect(document.activeElement).toBe(moveUp);
    expect(screen.getByText('Advanced summary sidebar').closest('details')).toHaveProperty('open', true);
  });
});
