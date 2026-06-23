import { readFile, readdir, stat } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

import yazl from 'yazl';

/** Recursively collect file paths under `dir` (skips nothing — the server guards). */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Package a skill directory (or a single SKILL.md / .zip file) into the zip
 * payload the registry expects. A directory is zipped with paths relative to it
 * (forward slashes); a `.zip` is read as-is; any other file is zipped at its
 * basename so a lone `SKILL.md` works.
 */
export async function packageSkill(path: string): Promise<Buffer> {
  const st = await stat(path);
  if (st.isFile()) {
    if (path.endsWith('.zip')) {
      return readFile(path);
    }
    const name = path.split(sep).pop() ?? 'SKILL.md';
    return zipEntries([{ name, content: await readFile(path) }]);
  }
  const files = await walk(path);
  const entries = await Promise.all(
    files.map(async (f) => ({
      name: relative(path, f).split(sep).join(posix.sep),
      content: await readFile(f),
    })),
  );
  return zipEntries(entries);
}

function zipEntries(entries: readonly { name: string; content: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const e of entries) {
      zip.addBuffer(e.content, e.name);
    }
    zip.end();
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
