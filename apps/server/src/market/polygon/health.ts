import { request } from 'undici';

export interface PolygonHealthResult {
  ok: boolean;
  reason?: string;
  level: 'fatal' | 'warn';
}

export async function checkPolygonAuth(apiKey: string): Promise<PolygonHealthResult> {
  if (!apiKey || apiKey.trim() === '') {
    return { ok: false, reason: 'missing api key', level: 'fatal' };
  }

  try {
    const response = await request(
      `https://api.polygon.io/v3/reference/exchanges?apiKey=${apiKey}`,
      {
        method: 'GET',
        headersTimeout: 2000,
        bodyTimeout: 2000,
      }
    );

    const status = response.statusCode;

    if (status === 200) {
      return { ok: true, level: 'warn' };
    }

    if (status === 401 || status === 403) {
      return { ok: false, reason: 'unauthorized/forbidden', level: 'fatal' };
    }

    if (status === 429) {
      return { ok: false, reason: 'rate limited', level: 'warn' };
    }

    return { ok: false, reason: `unknown status ${status}`, level: 'warn' };
  } catch (error) {
    return { ok: false, reason: `network error: ${(error as Error).message}`, level: 'warn' };
  }
}
