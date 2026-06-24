import { describe, expect, it } from 'vitest';

import { runInit } from '../../src/commands/init.js';
import { type TheoskillConfig } from '../../src/config.js';

const capture = (): { out: (l: string) => void; lines: string[] } => {
  const lines: string[] = [];
  return { out: (l) => lines.push(l), lines };
};

describe('runInit (T3.1 / gap #4)', () => {
  it('init_writes_registry_auth', () => {
    let written: TheoskillConfig | undefined;
    const { out } = capture();
    const code = runInit(
      { command: 'init', registry: 'http://reg', auth: 'tok' },
      { out, write: (c) => { written = c; } },
    );
    expect(code).toBe(0);
    expect(written).toEqual({ registry: 'http://reg', auth: 'tok' });
  });

  it('init_without_registry_exits_2', () => {
    let written: TheoskillConfig | undefined;
    const { out, lines } = capture();
    const code = runInit({ command: 'init' }, { out, write: (c) => { written = c; } });
    expect(code).toBe(2);
    expect(lines.join('')).toContain('--registry');
    expect(written).toBeUndefined();
  });

  it('init_never_prints_the_auth_value', () => {
    const { out, lines } = capture();
    runInit({ command: 'init', registry: 'http://reg', auth: 'SUPERSECRET' }, { out, write: () => undefined });
    expect(lines.join('')).not.toContain('SUPERSECRET');
    expect(lines.join('')).toContain('auth=***');
  });
});
