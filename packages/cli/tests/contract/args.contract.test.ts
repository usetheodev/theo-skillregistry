import { describe, expect, it } from 'vitest';

import { CliUsageError, parseCliArgs, resolveArgs } from '../../src/args.js';

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

  it('parses publish WITHOUT flags (missing-flags is enforced at runtime, not parse)', () => {
    expect(parseCliArgs(['publish', './s'])).toEqual({ command: 'publish', path: './s' });
  });

  it('throws on an unknown flag', () => {
    expect(() => parseCliArgs(['validate', './s', '--bogus', 'x'])).toThrow();
  });

  it('parses init with --registry + --auth', () => {
    expect(parseCliArgs(['init', '--registry', 'http://reg', '--auth', 'tok'])).toEqual({
      command: 'init',
      registry: 'http://reg',
      auth: 'tok',
    });
  });

  it('parses read commands with a positional id', () => {
    expect(parseCliArgs(['get', 'pdf'])).toEqual({ command: 'get', path: 'pdf' });
    expect(parseCliArgs(['status', 'op_1'])).toEqual({ command: 'status', path: 'op_1' });
    expect(parseCliArgs(['revisions', 'pdf'])).toEqual({ command: 'revisions', path: 'pdf' });
    expect(parseCliArgs(['list'])).toEqual({ command: 'list' });
  });
});

describe('resolveArgs (config↔flags precedence — T3.2)', () => {
  it('flags_override_config', () => {
    const r = resolveArgs({ command: 'publish', path: 's', registry: 'http://flag' }, { registry: 'http://config' });
    expect(r.registry).toBe('http://flag');
  });

  it('config_fills_registry_and_auth_when_flag_omitted', () => {
    const r = resolveArgs({ command: 'list' }, { registry: 'http://config', auth: 'tok' });
    expect(r.registry).toBe('http://config');
    expect(r.auth).toBe('tok');
  });
});
