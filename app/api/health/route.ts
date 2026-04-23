export const runtime = 'edge';
// 30-second cache — health status changes rarely, but we want prompt detection
// of outages. Bots and uptime monitors hit this constantly; caching protects
// the upstream Supabase REST call from being a DDoS vector.
export const revalidate = 30;
import handler from "../../../server-handlers/health";

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
export async function OPTIONS(req: Request) { return handler(req); }
