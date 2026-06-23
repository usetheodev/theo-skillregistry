import { describe, expect, it } from 'vitest';

import { assertPublicUrl, UrlSafetyError, type DnsResolver } from '../../src/server/webhooks/url-safety.js';

const publicResolver: DnsResolver = {
  resolve4: () => Promise.resolve(['93.184.216.34']),
  resolve6: () => Promise.resolve([]),
};
const privateResolver: DnsResolver = {
  resolve4: () => Promise.resolve(['10.0.0.5']),
  resolve6: () => Promise.resolve([]),
};

describe('assertPublicUrl (SSRF guard)', () => {
  it('rejects private / loopback / link-local / metadata IP literals', async () => {
    for (const url of [
      'http://127.0.0.1/wh',
      'http://10.0.0.1/wh',
      'http://169.254.169.254/latest/meta-data', // cloud metadata
      'http://192.168.1.10/wh',
      'http://172.16.5.5/wh',
      'http://[::1]/wh',
    ]) {
      await expect(assertPublicUrl(url, publicResolver), url).rejects.toBeInstanceOf(UrlSafetyError);
    }
  });

  it('rejects non-http(s) schemes and malformed urls', async () => {
    await expect(assertPublicUrl('ftp://example.com', publicResolver)).rejects.toMatchObject({ reason: 'scheme_not_allowed' });
    await expect(assertPublicUrl('not a url', publicResolver)).rejects.toMatchObject({ reason: 'malformed_url' });
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    await expect(assertPublicUrl('https://internal.example', privateResolver)).rejects.toMatchObject({
      reason: 'private_ip',
    });
  });

  it('accepts a public hostname / IP', async () => {
    await expect(assertPublicUrl('https://example.com/wh', publicResolver)).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('https://93.184.216.34/wh', publicResolver)).resolves.toBeInstanceOf(URL);
  });
});
