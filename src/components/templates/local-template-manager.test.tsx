/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';
import { LocalTemplateQuotaError } from '@/lib/templates/local-template.repository';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-local-templates', () => ({ useLocalTemplates: () => mocks.state }));
vi.mock('@/lib/templates/local-template-thumbnail', () => ({
  createLocalTemplateThumbnail: async () => new Blob([new Uint8Array(16)], { type: 'image/png' }),
}));
vi.mock('./local-template-editor', () => ({
  LocalTemplateEditor: ({ onChange }: { onChange(value: TemplateManifestV1): void }) => (
    <button type="button" onClick={() => onChange(manifest('#dc2626'))}>edit-manifest</button>
  ),
}));

import { LocalTemplateManager } from './local-template-manager';

function manifest(accent = '#2563eb'): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent, background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function record(): LocalTemplateRecord {
  return {
    userId: 'user-a', localId: 'local-a', name: 'Local A', category: 'general', localTags: ['clean'],
    sourceDescription: '', templateVersion: '1.0.0', manifest: manifest(),
    thumbnail: new Blob([new Uint8Array(16)], { type: 'image/png' }),
    createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

function readyState(overrides: Record<string, unknown> = {}) {
  return {
    records: [record()], corruptCount: 0, status: 'ready', errorCode: null,
    save: vi.fn(async (value) => value), remove: vi.fn(async () => undefined),
    importPackage: vi.fn(async () => record()), exportPackage: vi.fn(async () => '{}'), refresh: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LocalTemplateManager', () => {
  test('creates and edits a template with a fixed-fixture thumbnail', async () => {
    const state = readyState({ records: [] });
    mocks.state = state;
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.change(screen.getByLabelText('fields.name'), { target: { value: 'My Local' } });
    fireEvent.change(screen.getByLabelText('fields.sourceDescription'), { target: { value: 'Built from a reviewed reference' } });
    fireEvent.change(screen.getByLabelText('fields.templateVersion'), { target: { value: '2.4.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'edit-manifest' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      name: 'My Local',
      sourceDescription: 'Built from a reviewed reference',
      templateVersion: '2.4.0',
      manifest: expect.objectContaining({ colors: expect.objectContaining({ accent: '#dc2626' }) }),
      thumbnail: expect.any(Blob),
    }));
  });

  test('loads source description and template version when editing an existing record', () => {
    const state = readyState({
      records: [{ ...record(), sourceDescription: 'Imported from local JSON', templateVersion: '4.5.6' }],
    });
    mocks.state = state;
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));

    expect(screen.getByLabelText('fields.sourceDescription')).toHaveProperty('value', 'Imported from local JSON');
    expect(screen.getByLabelText('fields.templateVersion')).toHaveProperty('value', '4.5.6');
  });

  test('applies, copies and removes without coupling saved Resumes to the local ID', async () => {
    const state = readyState();
    mocks.state = state;
    const onApply = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LocalTemplateManager userId="user-a" onApply={onApply} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.apply' }));
    expect(onApply).toHaveBeenCalledWith(manifest());
    fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a', manifest: manifest(),
    })));
    expect((state.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].localId).not.toBe('local-a');
    fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('local-a'));
    expect(window.confirm).toHaveBeenCalledWith('deleteSnapshotWarning');
  });

  test('imports and exports packages and renders stable degradation/corruption states', async () => {
    const state = readyState({ corruptCount: 2 });
    mocks.state = state;
    const createObjectURL = vi.fn(() => 'blob:download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    expect(screen.getByText('states.corrupt')).toBeTruthy();
    const input = screen.getByLabelText('actions.import');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'template.jade-template.json', { type: 'application/json' })] } });
    await waitFor(() => expect(state.importPackage).toHaveBeenCalledWith('{}'));
    fireEvent.click(screen.getByRole('button', { name: 'actions.export' }));
    await waitFor(() => expect(state.exportPackage).toHaveBeenCalledWith(record()));
    expect(createObjectURL).toHaveBeenCalled();

    cleanup();
    mocks.state = readyState({ records: [], status: 'degraded', errorCode: 'LOCAL_TEMPLATE_STORAGE_UNAVAILABLE' });
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);
    expect(screen.getByText('states.unavailable')).toBeTruthy();
  });

  test('renders a stable quota state instead of leaking a rejected save', async () => {
    const state = readyState({
      records: [],
      save: vi.fn(async () => { throw new LocalTemplateQuotaError(); }),
    });
    mocks.state = state;
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(screen.getByText('states.quota')).toBeTruthy());
  });
});
