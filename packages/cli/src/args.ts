import { parseArgs } from 'node:util';

export type CliCommand = 'validate' | 'publish' | 'help';

export interface ParsedCli {
  readonly command: CliCommand;
  /** Positional path argument (skill dir or zip). */
  readonly path?: string;
  readonly registry?: string;
  readonly skillId?: string;
}

export class CliUsageError extends Error {}

/**
 * Parse `theoskill <command> [path] [--registry url] [--skill-id id]` using the
 * Node stdlib `parseArgs` (no arg-parser dependency — parsimony ladder).
 */
export function parseCliArgs(argv: readonly string[]): ParsedCli {
  const command = argv[0];
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' };
  }
  if (command !== 'validate' && command !== 'publish') {
    throw new CliUsageError(`unknown command: ${command}`);
  }
  const { values, positionals } = parseArgs({
    args: [...argv.slice(1)],
    allowPositionals: true,
    options: {
      registry: { type: 'string' },
      'skill-id': { type: 'string' },
    },
  });
  const path = positionals[0];
  const result: ParsedCli = {
    command,
    ...(path !== undefined ? { path } : {}),
    ...(values.registry !== undefined ? { registry: values.registry } : {}),
    ...(values['skill-id'] !== undefined ? { skillId: values['skill-id'] } : {}),
  };
  return result;
}

export const HELP_TEXT = `theoskill — Theo Skill Registry dev CLI

Usage:
  theoskill validate <path>                          validate a skill locally
  theoskill publish  <path> --registry <url> --skill-id <id>   validate + publish

Exit code 0 on success, non-zero on any validation or publish failure.`;
