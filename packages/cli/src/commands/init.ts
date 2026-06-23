import { type ParsedCli } from '../args.js';
import { configPath, type TheoskillConfig, writeConfig } from '../config.js';

export interface InitDeps {
  readonly out: (line: string) => void;
  /** Injected for tests — defaults to writing `.theoskillrc` in cwd. */
  readonly write?: (config: TheoskillConfig) => void;
  readonly path?: string;
}

/** `theoskill init --registry <url> [--auth <token>]` — persist local config. */
export function runInit(args: ParsedCli, deps: InitDeps): number {
  if (args.registry === undefined || args.registry.length === 0) {
    deps.out('init: --registry <url> is required');
    return 2;
  }
  const config: TheoskillConfig = {
    registry: args.registry,
    ...(args.auth !== undefined ? { auth: args.auth } : {}),
  };
  const target = deps.path ?? configPath();
  const write = deps.write ?? ((c: TheoskillConfig): void => { writeConfig(target, c); });
  write(config);
  // NEVER print the auth value (secret).
  deps.out(`init: wrote ${target} (registry=${args.registry}${args.auth !== undefined ? ', auth=***' : ''})`);
  return 0;
}
