import { describe, expect, it } from 'vitest';

import { CliUsageError, parseCliArgs } from '../../src/args.js';

describe('parseCliArgs', () => {
  it('parses validate with a path', () => {
    expect(parseCliArgs(['validate', './my-skill'])).toEqual({ command: 'validate', path: './my-skill' });
  });

  it('parses publish with path + registry + skill-id', () => {
    expect(parseCliArgs(['publish', './s', '--registry', 'http://localhost:8080', '--skill-id', 'my-skill'])).toEqual({
      command: 'publish',
      path: './s',
      registry: 'http://localhost:8080',
      skillId: 'my-skill',
    });
  });

  it('treats no args / help / -h as the help command', () => {
    for (const a of [[], ['help'], ['--help'], ['-h']]) {
      expect(parseCliArgs(a).command).toBe('help');
    }
  });

  it('throws CliUsageError on an unknown command', () => {
    expect(() => parseCliArgs(['frobnicate'])).toThrow(CliUsageError);
  });
});
