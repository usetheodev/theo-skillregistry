import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, writeConfig } from '../../src/config.js';

describe('theoskill config (T3.1 / gaps #4-#5)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'theocfg-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loadConfig_returns_empty_when_no_file', () => {
    expect(loadConfig(join(dir, 'nope.json'))).toEqual({});
  });

  it('writeConfig_then_loadConfig_round_trips_registry_and_auth', () => {
    const p = join(dir, '.theoskillrc');
    writeConfig(p, { registry: 'http://reg', auth: 'tok' });
    expect(loadConfig(p)).toEqual({ registry: 'http://reg', auth: 'tok' });
  });

  it('writeConfig_uses_0600_perms', () => {
    const p = join(dir, '.theoskillrc');
    writeConfig(p, { registry: 'http://reg' });
    expect((statSync(p).mode & 0o777).toString(8)).toBe('600');
  });

  it('loadConfig_returns_empty_on_malformed_json', () => {
    const p = join(dir, '.theoskillrc');
    writeFileSync(p, '{ not valid json ');
    expect(loadConfig(p)).toEqual({}); // EC-6 — never throws
  });

  it('loadConfig_ignores_unknown_and_non_string_fields', () => {
    const p = join(dir, '.theoskillrc');
    writeFileSync(p, JSON.stringify({ registry: 'http://reg', auth: 123, extra: true }));
    expect(loadConfig(p)).toEqual({ registry: 'http://reg' });
  });

  it('persisted_file_contains_registry', () => {
    const p = join(dir, '.theoskillrc');
    writeConfig(p, { registry: 'http://reg' });
    expect(readFileSync(p, 'utf8')).toContain('"registry"');
  });
});
