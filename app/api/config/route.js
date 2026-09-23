import { webConfig } from '../../../src/web-runner.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await webConfig(), { headers: { 'Cache-Control': 'no-store' } });
}
