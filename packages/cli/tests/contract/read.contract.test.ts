import { describe, expect, it, vi } from 'vitest';

import { type ParsedCli } from '../../src/args.js';
import { runRead } from '../../src/commands/read.js';

const res = (status: number, body: string): Response =>
  ({ status, text: () => Promise.resolve(body) }) as unknown as Response;

const capture = (): { out: (l: string) => void; lines: string[] } => {
  const lines: string[] = [];
  return { out: (l) => lines.push(l), lines };
};

describe('runRead (T3.3 / gap #5)', () => {
  it('get_fetches_skill_by_id', async () => {
    let url = '';
    const fetch = vi.fn((u: string) => { url = u; return Promise.resolve(res(200, '{"skill_id":"pdf"}')); }) as unknown as typeof globalThis.fetch;
    const { out, lines } = capture();
    const code = await runRead({ command: 'get', path: 'pdf' }, { out, fetch, registry: 'http://reg' });
    expect(code).toBe(0);
    expect(url).toContain('/v1/skills/pdf');
    expect(lines.join('')).toContain('pdf');
  });

  it('list_status_revisions_hit_correct_routes', async () => {
    const cases: [ParsedCli, string][] = [
      [{ command: 'list' }, '/v1/skills'],
      [{ command: 'status', path: 'op_1' }, '/v1/operations/op_1'],
      [{ command: 'revisions', path: 'pdf' }, '/v1/skills/pdf/revisions'],
    ];
    for (const [args, expected] of cases) {
      let url = '';
      const fetch = vi.fn((u: string) => { url = u; return Promise.resolve(res(200, '{}')); }) as unknown as typeof globalThis.fetch;
      await runRead(args, { out: () => undefined, fetch, registry: 'http://reg' });
      expect(url).toContain(expected);
    }
  });

  it('non_200_exits_1', async () => {
    const fetch = vi.fn(() => Promise.resolve(res(404, 'not_found'))) as unknown as typeof globalThis.fetch;
    const { out, lines } = capture();
    const code = await runRead({ command: 'get', path: 'x' }, { out, fetch, registry: 'http://reg' });
    expect(code).toBe(1);
    expect(lines.join('')).toContain('404');
  });

  it('get_without_id_exits_2_usage', async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const { out, lines } = capture();
    const code = await runRead({ command: 'get' }, { out, fetch, registry: 'http://reg' });
    expect(code).toBe(2);
    expect(lines.join('')).toContain('usage');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('read_sends_auth_header_from_config', async () => {
    let init: RequestInit | undefined;
    const fetch = vi.fn((_u: string, i?: RequestInit) => { init = i; return Promise.resolve(res(200, '{}')); }) as unknown as typeof globalThis.fetch;
    await runRead({ command: 'list' }, { out: () => undefined, fetch, registry: 'http://reg', auth: 'tok' });
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
  });

  it('unreachable_registry_exits_2', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof globalThis.fetch;
    const { out, lines } = capture();
    const code = await runRead({ command: 'list' }, { out, fetch, registry: 'http://reg' });
    expect(code).toBe(2);
    expect(lines.join('')).toMatch(/could not reach the registry/);
  });
});
