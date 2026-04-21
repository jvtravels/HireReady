export const runtime = 'edge';
import handler from "../../../server-handlers/sarvam-token";

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
export async function OPTIONS(req: Request) { return handler(req); }
