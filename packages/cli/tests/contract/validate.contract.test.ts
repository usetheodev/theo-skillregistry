import { createSecretlintScanner, createYauzlPayloadValidator } from '@usetheo/skillregistry-api/validators';
import { describe, expect, it } from 'vitest';
import yazl from 'yazl';

import { runValidate } from '../../src/commands/validate.js';

const validation = { payloadValidator: createYauzlPayloadValidator(), secretScanner: createSecretlintScanner() };

function zip(content: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(content, 'utf8'), 'SKILL.md');
    z.end();
    const chunks: Buffer[] = [];
    z.outputStream.on('data', (c: Buffer) => chunks.push(c));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function capture(): { out: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { out: (l) => lines.push(l), lines };
}

describe('runValidate', () => {
  it('returns 0 and prints ok for a valid skill', async () => {
    const buf = await zip(`---\nname: my-skill\ndescription: a useful skill\n---\n# my-skill\n`);
    const { out, lines } = capture();
    const code = await runValidate('skill', { validation, out, package: () => Promise.resolve(buf) });
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/ok:.*valid skill/);
  });

  it('returns 1 and prints the rule code for an invalid frontmatter', async () => {
    const buf = await zip(`---\nname: Invalid Name\ndescription: x\n---\n# x\n`);
    const { out, lines } = capture();
    const code = await runValidate('skill', { validation, out, package: () => Promise.resolve(buf) });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('[schema_invalid]');
  });

  it('returns 2 when no path is given', async () => {
    const { out, lines } = capture();
    expect(await runValidate(undefined, { validation, out })).toBe(2);
    expect(lines.join('\n')).toMatch(/requires a <path>/);
  });

  it('returns 2 on a read/package error', async () => {
    const { out } = capture();
    const code = await runValidate('nope', { validation, out, package: () => Promise.reject(new Error('ENOENT')) });
    expect(code).toBe(2);
  });
});
