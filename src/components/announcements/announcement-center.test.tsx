import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnnouncementCenter } from './announcement-center';

describe('AnnouncementCenter', () => {
  it('does not access document or render the overlay during SSR', () => {
    const html = renderToString(<AnnouncementCenter />);

    expect(html).toContain('Announcements');
    expect(html).not.toContain('fixed inset-0');
  });
});
