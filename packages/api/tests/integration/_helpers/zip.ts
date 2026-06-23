import yazl from 'yazl';

/** Build an in-memory zip from path→content entries; returns base64. */
export function buildZipBase64(entries: readonly { path: string; content: string }[]): Promise<string> {
  return new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    for (const e of entries) {
      zip.addBuffer(Buffer.from(e.content, 'utf8'), e.path);
    }
    zip.end();
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
  });
}

export function skillMd(name: string, description = 'Does a thing. Use when X.'): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;
}
