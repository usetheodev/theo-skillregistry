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

  it('rejects CGNAT / mapped-IPv6 / unique-local / link-local / 0.0.0.0 + boundary cases', async () => {
    for (const url of [
      'http://100.64.0.1/wh', // CGNAT lower bound
      'http://100.127.255.255/wh', // CGNAT upper bound
      'http://0.0.0.0/wh', // 0.0.0.0/8
      'http://172.16.0.1/wh', // 172.16/12 lower bound
      'http://172.31.255.255/wh', // 172.16/12 upper bound
      'http://[fc00::1]/wh', // unique-local
      'http://[fd12::1]/wh', // unique-local
      'http://[fe80::1]/wh', // link-local
      'http://[::ffff:10.0.0.1]/wh', // IPv4-mapped IPv6 → private
      'http://2130706433/wh', // decimal-encoded 127.0.0.1
      'http://0x7f000001/wh', // hex-encoded 127.0.0.1
    ]) {
      await expect(assertPublicUrl(url, publicResolver), url).rejects.toBeInstanceOf(UrlSafetyError);
    }
  });

  it('accepts public IP literals just outside private ranges (boundary counter-examples)', async () => {
    for (const url of [
      'http://100.63.255.255/wh', // just below CGNAT
      'http://172.15.0.1/wh', // just below 172.16/12
      'http://172.32.0.1/wh', // just above 172.16/12
      'http://8.8.8.8/wh',
    ]) {
      await expect(assertPublicUrl(url, publicResolver), url).resolves.toBeInstanceOf(URL);
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
