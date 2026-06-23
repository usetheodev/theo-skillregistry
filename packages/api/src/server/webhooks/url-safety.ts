/**
 * SSRF guard for user-controlled webhook endpoint URLs (OWASP A10). Adapted
 * verbatim from the theo-rag pattern (Unbreakable Rule 9 — do not reinvent).
 */
import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface DnsResolver {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
}

const DEFAULT_RESOLVER: DnsResolver = { resolve4, resolve6 };

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

// First octet → predicate over the second octet for private/reserved IPv4 ranges.
const IPV4_PRIVATE_CHECKS: ReadonlyMap<number, (b: number) => boolean> = new Map([
  [0, () => true], // 0.0.0.0/8
  [10, () => true], // 10.0.0.0/8
  [100, (b: number) => b >= 64 && b <= 127], // 100.64.0.0/10 CGNAT
  [127, () => true], // loopback
  [169, (b: number) => b === 254], // link-local (incl. 169.254.169.254 metadata)
  [172, (b: number) => b >= 16 && b <= 31], // 172.16.0.0/12
  [192, (b: number) => b === 168 || b === 0], // 192.168/16 + 192.0.0/24
  [198, (b: number) => b === 18 || b === 19], // benchmarking
]);

export class UrlSafetyError extends Error {
  readonly reason: string;

  constructor(reason: string, detail?: string) {
    super(`URL is unsafe: ${reason}${detail !== undefined ? ` (${detail})` : ''}`);
    this.name = 'UrlSafetyError';
    this.reason = reason;
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  const [a, b] = parts;
  if (a === undefined || b === undefined) {
    return true; // malformed → treat as unsafe
  }
  const check = IPV4_PRIVATE_CHECKS.get(a);
  return check !== undefined && check(b);
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('::ffff:')) return true; // IPv4-mapped
  if (lower.startsWith('64:ff9b:')) return true; // NAT64
  if (/^2002:/.test(lower)) return true; // 6to4
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('ff')) return true; // multicast
  if (/^fe[89ab]/.test(lower)) return true; // link-local
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true; // not an IP literal → unsafe in this context
}

function parseAndValidateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSafetyError('malformed_url', rawUrl);
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new UrlSafetyError('scheme_not_allowed', url.protocol);
  }
  return url;
}

/** Decides whether a resolved IP is allowed as an egress target. */
export type AddressPolicy = (ip: string) => boolean;

/** Default policy — only public addresses are allowed (rejects private/metadata). */
export const publicAddressPolicy: AddressPolicy = (ip) => !isPrivateIp(ip);

/**
 * Validate a URL is safe and return the concrete resolved addresses that passed
 * the policy. The caller PINS the connection to one of these addresses so the IP
 * validated here is the IP actually connected to (closes the DNS-rebind TOCTOU).
 * For an IP-literal host the address set is the literal itself.
 */
export async function resolveSafeAddresses(
  rawUrl: string,
  resolver: DnsResolver = DEFAULT_RESOLVER,
  isAllowed: AddressPolicy = publicAddressPolicy,
): Promise<{ url: URL; addresses: string[] }> {
  const url = parseAndValidateUrl(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) {
    if (!isAllowed(host)) {
      throw new UrlSafetyError('private_ip', host);
    }
    return { url, addresses: [host] };
  }
  const results = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
  const ips = results
    .filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  if (ips.length === 0) {
    throw new UrlSafetyError('dns_resolution_failed', host);
  }
  for (const ip of ips) {
    if (!isAllowed(ip)) {
      throw new UrlSafetyError('private_ip', `${host} → ${ip}`);
    }
  }
  return { url, addresses: ips };
}

/**
 * Validate a URL is public-safe: http(s) scheme, not a private/loopback/metadata
 * IP (literal or DNS-resolved). Throws UrlSafetyError otherwise.
 */
export async function assertPublicUrl(
  rawUrl: string,
  resolver: DnsResolver = DEFAULT_RESOLVER,
): Promise<URL> {
  return (await resolveSafeAddresses(rawUrl, resolver)).url;
}
