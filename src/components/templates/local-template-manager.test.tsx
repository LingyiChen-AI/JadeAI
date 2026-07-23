/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { StrictMode } from 'react';

import type { LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';
import { LocalTemplateQuotaError } from '@/lib/templates/local-template.repository';
import { createLocalTemplatePreset } from '@/lib/templates/local-template-presets';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  editorProps: null as null | {
    draftKey: string;
    saveVersion?: number | string;
    onChange(value: TemplateManifestV1): void;
    onDirtyChange?(dirty: boolean): void;
  },
  thumbnailCreate: vi.fn(),
  dateTime: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (value: Date, options: Intl.DateTimeFormatOptions) => {
      mocks.dateTime(value, options);
      return 'formatted-date';
    },
  }),
}));
vi.mock('@/hooks/use-local-templates', () => ({ useLocalTemplates: () => mocks.state }));
vi.mock('@/lib/templates/local-template-thumbnail', () => ({
  createLocalTemplateThumbnail: (value: TemplateManifestV1) => mocks.thumbnailCreate(value),
}));
vi.mock('./local-template-editor', () => ({
  LocalTemplateEditor: (props: NonNullable<typeof mocks.editorProps>) => {
    mocks.editorProps = props;
    return (
      <div data-testid="local-template-editor" data-draft-key={props.draftKey} data-save-version={props.saveVersion}>
        <button type="button" onClick={() => props.onChange(manifest('#dc2626'))}>edit-manifest</button>
        <button type="button" onClick={() => props.onDirtyChange?.(true)}>edit-dirty</button>
        <button type="button" onClick={() => props.onDirtyChange?.(false)}>edit-clean</button>
      </div>
    );
  },
}));
vi.mock('./local-template-thumbnail', () => ({
  LocalTemplateThumbnail: ({ thumbnail, alt }: { thumbnail: Blob; alt: string }) => (
    <div data-testid="local-template-thumbnail" data-is-blob={thumbnail instanceof Blob} className="aspect-[3/4]">
      {alt}
    </div>
  ),
}));

import { createDefaultLocalTemplateManifest, LocalTemplateManager } from './local-template-manager';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function openActionMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'actions.more' }), {
    button: 0,
    ctrlKey: false,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.editorProps = null;
  mocks.thumbnailCreate.mockReset();
  mocks.thumbnailCreate.mockResolvedValue(new Blob([new Uint8Array(16)], { type: 'image/png' }));
  mocks.dateTime.mockReset();
});

describe('LocalTemplateManager', () => {
  test('reports combined manifest and metadata dirty state', async () => {
    mocks.state = readyState({ records: [] });
    const onDirtyChange = vi.fn();
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} onDirtyChange={onDirtyChange} />);

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.change(screen.getByLabelText('fields.category'), { target: { value: 'changed' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.change(screen.getByLabelText('fields.category'), { target: { value: 'general' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: 'edit-clean' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  test('registers beforeunload only while dirty and removes it when clean or unmounted', async () => {
    mocks.state = readyState({ records: [] });
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const mounted = render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function)));
    const handler = add.mock.calls.find(([type]) => type === 'beforeunload')?.[1] as (event: BeforeUnloadEvent) => void;
    const event = { preventDefault: vi.fn(), returnValue: 'unchanged' } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'edit-clean' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('beforeunload', handler));

    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    await waitFor(() => expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(2));
    const latestHandler = add.mock.calls.filter(([type]) => type === 'beforeunload').at(-1)?.[1];
    mounted.unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', latestHandler);
  });

  test('reports clean after cancel and successful save', async () => {
    mocks.state = readyState({ records: [] });
    const onDirtyChange = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(screen.queryByTestId('local-template-editor')).toBeNull());
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  test('keeps the legacy default helper as a fresh ATS Clean preset', () => {
    const first = createDefaultLocalTemplateManifest();
    const second = createDefaultLocalTemplateManifest();

    expect(first).toEqual(createLocalTemplatePreset('ats-clean'));
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  test('passes each local ID as the required editor draft identity', () => {
    mocks.state = readyState();
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    openActionMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'actions.edit' }));
    expect(screen.getByTestId('local-template-editor').getAttribute('data-draft-key')).toBe('local-a');
  });

  test('confirms cancel only when manifest or metadata is dirty', () => {
    mocks.state = readyState({ records: [] });
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValue(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'edit-dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(confirm).toHaveBeenCalledWith('dirtyConfirm');
    expect(screen.getByTestId('local-template-editor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(screen.queryByTestId('local-template-editor')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.change(screen.getByLabelText('fields.category'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenLastCalledWith('dirtyConfirm');
  });

  test('treats metadata edits as dirty and retains a failed draft for retry', async () => {
    const state = readyState({
      records: [],
      save: vi.fn(async () => { throw new Error('save failed'); }),
    });
    mocks.state = state;
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.change(screen.getByLabelText('fields.name'), { target: { value: 'Private sentinel must stay out' } });
    fireEvent.click(screen.getByRole('button', { name: 'edit-manifest' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(screen.getByText('states.operation')).toBeTruthy());
    expect(screen.getByTestId('local-template-editor')).toBeTruthy();
    expect(screen.getByLabelText('fields.name')).toHaveProperty('value', 'Private sentinel must stay out');
    expect(mocks.thumbnailCreate).toHaveBeenCalledWith(manifest('#dc2626'));
    expect(mocks.thumbnailCreate.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(mocks.thumbnailCreate.mock.calls[0])).not.toContain('private@example.com');
  });

  test('locks every draft-changing control while a save is pending', async () => {
    const thumbnail = deferred<Blob>();
    const persisted = deferred<LocalTemplateRecord>();
    const state = readyState({
      records: [],
      save: vi.fn(() => persisted.promise),
    });
    mocks.state = state;
    mocks.thumbnailCreate.mockReturnValue(thumbnail.promise);
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    expect(screen.getByLabelText('fields.name')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'actions.cancel' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'actions.create' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('actions.import')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'actions.import' })).toHaveProperty('disabled', true);

    thumbnail.resolve(new Blob(['thumbnail'], { type: 'image/png' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('fields.category')).toHaveProperty('disabled', true);

    persisted.resolve(record());
    await waitFor(() => expect(screen.queryByTestId('local-template-editor')).toBeNull());
  });

  test('ignores a thumbnail completion after unmount without continuing persistence', async () => {
    const thumbnail = deferred<Blob>();
    const state = readyState({ records: [] });
    mocks.state = state;
    mocks.thumbnailCreate.mockReturnValue(thumbnail.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mounted = render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    mounted.unmount();
    thumbnail.resolve(new Blob(['late'], { type: 'image/png' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(state.save).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('keeps save completion active after the StrictMode effect replay', async () => {
    const state = readyState({ records: [] });
    mocks.state = state;
    render(
      <StrictMode>
        <LocalTemplateManager userId="user-a" onApply={vi.fn()} />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('local-template-editor')).toBeNull();
  });

  test('renders Blob thumbnails, stable card layout, update time, and one primary Use action', () => {
    mocks.state = readyState();
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    expect(screen.getByTestId('local-template-thumbnail').getAttribute('data-is-blob')).toBe('true');
    expect(screen.getByTestId('local-template-thumbnail').className).toContain('aspect-[3/4]');
    expect(screen.getByText('lastUpdated')).toBeTruthy();
    expect(mocks.dateTime).toHaveBeenCalledWith(
      new Date('2026-07-16T00:00:00.000Z'),
      { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
    );
    expect(screen.getByRole('button', { name: 'actions.apply' }).textContent).toContain('actions.apply');
    expect(screen.getByRole('button', { name: 'actions.more' })).toBeTruthy();
  });

  test('groups template metadata in one native disclosure', () => {
    mocks.state = readyState({ records: [] });
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));

    const summary = screen.getByText('templateInfo');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')).toBeTruthy();
    expect(summary.closest('details')?.querySelectorAll('input')).toHaveLength(5);
  });

  test('offers the public catalog from the empty state', () => {
    mocks.state = readyState({ records: [] });
    const onBrowsePublic = vi.fn();
    render(
      <LocalTemplateManager
        userId="user-a"
        onApply={vi.fn()}
        onBrowsePublic={onBrowsePublic}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.browsePublic' }));

    expect(onBrowsePublic).toHaveBeenCalledTimes(1);
  });

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
    expect(mocks.thumbnailCreate).toHaveBeenCalledWith(manifest('#dc2626'));
    expect(screen.queryByTestId('local-template-editor')).toBeNull();
  });

  test('loads source description and template version when editing an existing record', () => {
    const state = readyState({
      records: [{ ...record(), sourceDescription: 'Imported from local JSON', templateVersion: '4.5.6' }],
    });
    mocks.state = state;
    render(<LocalTemplateManager userId="user-a" onApply={vi.fn()} />);

    openActionMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'actions.edit' }));

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
    openActionMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'actions.copy' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a', manifest: manifest(),
    })));
    expect((state.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].localId).not.toBe('local-a');
    openActionMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'actions.delete' }));
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
    openActionMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'actions.export' }));
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
