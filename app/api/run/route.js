import { runWebBenchmark } from '../../../src/web-runner.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runWebBenchmark({ mode: body?.mode || 'demo', inProcess: true });
    return Response.json(result, { status: result.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Unexpected server error.' }, { status: error.statusCode || 500 });
  }
}
