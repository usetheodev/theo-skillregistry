import { describe, expect, it, vi } from 'vitest';

import { main } from '../../src/index.js';

function silence(): () => void {
  const o = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const e = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  return () => {
    o.mockRestore();
    e.mockRestore();
  };
}

describe('main (CLI dispatch)', () => {
  it('returns 0 for help / no args', async () => {
    const restore = silence();
    expect(await main(['help'])).toBe(0);
    expect(await main([])).toBe(0);
    restore();
  });

  it('returns 2 for an unknown command', async () => {
    const restore = silence();
    expect(await main(['frobnicate'])).toBe(2);
    restore();
  });

  it('returns 2 for validate without a path', async () => {
    const restore = silence();
    expect(await main(['validate'])).toBe(2);
    restore();
  });

  it('returns 2 for publish without required flags', async () => {
    const restore = silence();
    expect(await main(['publish', './skill'])).toBe(2);
    restore();
  });
});
