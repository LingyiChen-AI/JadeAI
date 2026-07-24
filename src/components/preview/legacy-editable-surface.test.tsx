// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
import { buildLegacyFieldCandidates, LegacyEditableSurface } from './legacy-editable-surface';

afterEach(cleanup);

function resume(): Resume {
  const now = new Date();
  return {
    id: 'r1', userId: 'u1', title: 'Resume', template: 'classic', revision: 1,
    templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    themeConfig: { primaryColor: '#111', accentColor: '#222', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 1.5, sectionSpacing: 6, margin: { top: 12, right: 12, bottom: 12, left: 12 } },
    isDefault: false, language: 'en', createdAt: now, updatedAt: now,
    sections: [{
      id: 'personal-1', resumeId: 'r1', type: 'personal_info', title: 'Profile', sortOrder: 0, visible: true,
      content: { fullName: 'Alex Chen', jobTitle: 'Engineer', email: 'alex@example.com', phone: '100', location: 'Shanghai' },
      createdAt: now, updatedAt: now,
    }, {
      id: 'work-1', resumeId: 'r1', type: 'work_experience', title: 'Work', sortOrder: 1, visible: true,
      content: { items: [{ id: 'job-1', company: 'Jade', position: 'Engineer', startDate: '2025', endDate: null, current: true, description: '**Reliable** systems', technologies: ['TypeScript'], highlights: ['Reduced latency'] }] },
      createdAt: now, updatedAt: now,
    }],
  };
}

describe('legacy editable surface', () => {
  it('builds stable sources for nested entries and list values', () => {
    const candidates = buildLegacyFieldCandidates(resume());

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'Alex Chen', source: expect.objectContaining({ sectionId: 'personal-1', fieldPath: ['fullName'] }) }),
      expect.objectContaining({ value: '**Reliable** systems', displayValue: 'Reliable systems', source: expect.objectContaining({ sectionId: 'work-1', itemId: 'job-1', fieldPath: ['description'] }) }),
      expect.objectContaining({ value: 'Reduced latency', source: expect.objectContaining({ sectionId: 'work-1', itemId: 'job-1', fieldPath: ['highlights', 0] }) }),
    ]));
  });

  it('opens an input over clicked A4 text and commits to the draft source', () => {
    const updateField = vi.fn();
    render(
      <LegacyEditableSurface resume={resume()} edit={{ enabled: true, updateField }}>
        <article><h1>Alex Chen</h1><section data-section><h2>Work</h2><p><strong>Reliable</strong> systems</p></section></article>
      </LegacyEditableSurface>,
    );

    fireEvent.click(screen.getByText('Alex Chen'));
    const input = screen.getByRole('textbox', { name: 'fullName' });
    fireEvent.change(input, { target: { value: 'Alex Li' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'personal-1', fieldPath: ['fullName'] }),
      'Alex Li',
    );
  });

  it('maps a clicked rich-text child back to the raw Markdown field', () => {
    const updateField = vi.fn();
    render(
      <LegacyEditableSurface resume={resume()} edit={{ enabled: true, updateField }}>
        <section data-section><h2>Work</h2><p><strong>Reliable</strong> systems</p></section>
      </LegacyEditableSurface>,
    );

    fireEvent.click(screen.getByText('Reliable'));
    const textarea = screen.getByRole('textbox', { name: 'description' });
    expect((textarea as HTMLTextAreaElement).value).toBe('**Reliable** systems');
  });

  it('maps the second duplicate rendered value to the second stable item', () => {
    const source = resume();
    const work = source.sections[1].content as unknown as { items: Array<Record<string, unknown>> };
    work.items.push({ ...work.items[0], id: 'job-2' });
    const updateField = vi.fn();
    render(
      <LegacyEditableSurface resume={source} edit={{ enabled: true, updateField }}>
        <section data-section><p>Jade</p><p>Jade</p><p>Engineer</p><p>Engineer</p></section>
      </LegacyEditableSurface>,
    );

    fireEvent.click(screen.getAllByText('Jade')[1]);
    const input = screen.getByRole('textbox', { name: 'company' });
    fireEvent.change(input, { target: { value: 'Second Jade' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'work-1', itemId: 'job-2', fieldPath: ['company'] }),
      'Second Jade',
    );
  });

  it('maps a strong child in the second duplicate rich-text host to the second item', () => {
    const source = resume();
    const work = source.sections[1].content as unknown as { items: Array<Record<string, unknown>> };
    work.items.push({ ...work.items[0], id: 'job-2' });
    const updateField = vi.fn();
    render(
      <LegacyEditableSurface resume={source} edit={{ enabled: true, updateField }}>
        <section data-section>
          <p><strong>Reliable</strong> systems</p>
          <p><strong>Reliable</strong> systems</p>
        </section>
      </LegacyEditableSurface>,
    );

    fireEvent.click(screen.getAllByText('Reliable')[1]);
    const textarea = screen.getByRole('textbox', { name: 'description' });
    fireEvent.change(textarea, { target: { value: '**Second** systems' } });
    fireEvent.blur(textarea);

    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'work-1', itemId: 'job-2', fieldPath: ['description'] }),
      '**Second** systems',
    );
  });

  it('offers discoverable empty-field insertion points only in edit mode', () => {
    const source = resume();
    (source.sections[0].content as unknown as Record<string, unknown>).website = '';
    const updateField = vi.fn();
    const { rerender } = render(
      <LegacyEditableSurface resume={source} edit={{ enabled: true, updateField, emptyLabel: 'Add field' }}>
        <article><h1>Alex Chen</h1></article>
      </LegacyEditableSurface>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'website: Add field' }));
    const input = screen.getByRole('textbox', { name: 'website' });
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateField).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: 'personal-1', fieldPath: ['website'] }),
      'https://example.com',
    );

    rerender(
      <LegacyEditableSurface resume={source}>
        <article><h1>Alex Chen</h1></article>
      </LegacyEditableSurface>,
    );
    expect(screen.queryByRole('button', { name: 'website: Add field' })).toBeNull();
  });
});
