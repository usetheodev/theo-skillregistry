#!/usr/bin/env node
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { type SkillValidationDeps } from '@usetheo/skillregistry';
import { createSecretlintScanner, createYauzlPayloadValidator } from '@usetheo/skillregistry-api/validators';

import { CliUsageError, HELP_TEXT, parseCliArgs } from './args.js';
import { runPublish } from './commands/publish.js';
import { runValidate } from './commands/validate.js';

/** Build the shared validation deps with the SAME adapters the server uses. */
function realValidation(): SkillValidationDeps {
  return { payloadValidator: createYauzlPayloadValidator(), secretScanner: createSecretlintScanner() };
}

export async function main(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`${err.message}\n\n${HELP_TEXT}\n`);
      return 2;
    }
    throw err;
  }

  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  switch (parsed.command) {
    case 'help':
      out(HELP_TEXT);
      return 0;
    case 'validate':
      return runValidate(parsed.path, { validation: realValidation(), out });
    case 'publish':
      return runPublish(parsed, { validation: realValidation(), out, fetch: globalThis.fetch });
  }
}

// Auto-run ONLY when invoked as the binary (not when imported by a test).
const entry = argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main(argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 70;
    });
}
