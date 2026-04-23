export const runtime = 'edge';
// Voice catalog is effectively static — revalidate daily. Every auth'd user
// hits this on interview start; caching drops that to a 304 + zero Cartesia
// API calls per deploy-day.
export const revalidate = 86400;
import handler from "../../../server-handlers/voices";

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
export async function OPTIONS(req: Request) { return handler(req); }
