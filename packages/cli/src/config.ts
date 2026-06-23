import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Local CLI config persisted at `.theoskillrc` so publish/read need no repeated flags
 * (M9 / gaps #4-#5). `auth` is a secret — written 0600 and never printed. */
export interface TheoskillConfig {
  readonly registry?: string;
  readonly auth?: string;
}

export const CONFIG_FILE = '.theoskillrc';

export function configPath(cwd: string = process.cwd()): string {
  return join(cwd, CONFIG_FILE);
}

/** Read `.theoskillrc`. Missing OR malformed JSON → `{}` (never throws — EC-6). */
export function loadConfig(path: string = configPath()): TheoskillConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {}; // absent
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const rec = parsed as Record<string, unknown>;
    return {
      ...(typeof rec['registry'] === 'string' ? { registry: rec['registry'] } : {}),
      ...(typeof rec['auth'] === 'string' ? { auth: rec['auth'] } : {}),
    };
  } catch {
    return {}; // malformed JSON
  }
}

/** Persist config as pretty JSON with 0600 perms (auth is a secret). */
export function writeConfig(path: string, config: TheoskillConfig): void {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
