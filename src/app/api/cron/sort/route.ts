import { equal } from '@/lib/auth';
import { drainAiSort } from '@/lib/ai-sort';

export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !equal(request.headers.get('authorization') || '', `Bearer ${process.env.CRON_SECRET}`)) {
    return new Response('Not found', {status:404});
  }
  try { return Response.json(await drainAiSort('all', 240000)); }
  catch { return Response.json({error:'Sorting interrupted. Pending transactions will retry on the next run.'}, {status:503}); }
}
