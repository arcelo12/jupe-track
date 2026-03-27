import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.INTERNAL_API_URL || 'http://backend:3041';

function buildHeaders(request: NextRequest): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  // Forward Authorization header for authenticated routes
  const auth = request.headers.get('Authorization');
  if (auth) headers['Authorization'] = auth;
  return headers;
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
  body?: string,
): Promise<NextResponse> {
  const targetPath = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const queryStr = searchParams ? `?${searchParams}` : '';
  const targetUrl = `${BACKEND_URL}/api/v1/${targetPath}${queryStr}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(targetUrl, {
      method,
      signal: controller.signal,
      headers: buildHeaders(request),
      ...(body ? { body } : {}),
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[Proxy] ${method} ${targetUrl} failed: ${msg}`);
    return NextResponse.json({ error: 'Backend unreachable', detail: msg }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const body = await request.text();
  return proxyRequest(request, path, 'POST', body);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const body = await request.text();
  return proxyRequest(request, path, 'PUT', body);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const body = await request.text();
  return proxyRequest(request, path, 'PATCH', body);
}
