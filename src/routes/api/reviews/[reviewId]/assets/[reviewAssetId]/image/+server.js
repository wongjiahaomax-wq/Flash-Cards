export function GET() {
  return new Response('Legacy learner Review media has been retired.', {
    status: 410,
    headers: { 'Cache-Control': 'no-store' }
  });
}
