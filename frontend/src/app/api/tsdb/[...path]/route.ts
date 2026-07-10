import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GO_BACKEND_URL = process.env.INTERNAL_GO_API_URL || 'http://jupetrack_go:8080';

// SA-007: allowlist only read-only TSDB endpoints.
const ALLOWED_SEGMENTS = new Set(['query', 'query_range', 'series', 'labels']);

async function proxyTsdb(
  request: NextRequest,
  path: string[],
  method: string,
): Promise<NextResponse> {
  // SA-007: path allowlist — reject anything not in the read-only set.
  for (const seg of path) {
    if (!ALLOWED_SEGMENTS.has(seg)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const targetPath = path.join('/');

  // SA-007: delegate auth to the Go backend's metrics proxy (already hardened
  // with AuthMiddleware + endpoint allowlist). Forward the bearer token.
  const auth = request.headers.get('Authorization');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams.toString();
  const queryStr = searchParams ? `?${searchParams}` : '';
  const targetUrl = `${GO_BACKEND_URL}/api/v1/metrics/${targetPath}${queryStr}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(targetUrl, {
      method,
      signal: controller.signal,
      headers: { Authorization: auth },
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } else {
      const text = await res.text();
      return new NextResponse(text, { status: res.status });
    }
  } catch {
    clearTimeout(timeoutId);
    // SA-007: generic error — do not leak internal host / error detail.
    return NextResponse.json({ error: 'TSDB unreachable' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyTsdb(request, path, 'GET');
}
