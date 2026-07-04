import { NextRequest, NextResponse } from 'next/server';

const TSDB_URL = process.env.TSDB_URL || 'http://jupetrack_victoriametrics:8428';

async function proxyTsdb(
  request: NextRequest,
  path: string[],
  method: string,
): Promise<NextResponse> {
  const targetPath = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const queryStr = searchParams ? `?${searchParams}` : '';
  const targetUrl = `${TSDB_URL}/api/v1/${targetPath}${queryStr}`;

  try {
    const res = await fetch(targetUrl, { method });
    
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
    return NextResponse.json({ error: 'TSDB unreachable', detail: msg }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyTsdb(request, path, 'GET');
}
