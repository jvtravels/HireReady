export const runtime = 'nodejs';
import { adaptHandler } from "../../../lib/vercel-adapter";
import handler from "../../../api/razorpay-webhook";

export async function POST(req: Request) { return adaptHandler(req, handler); }
export async function GET(req: Request) { return adaptHandler(req, handler); }
export async function OPTIONS(req: Request) { return adaptHandler(req, handler); }
