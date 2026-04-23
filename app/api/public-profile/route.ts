export const runtime = 'edge';
// Public profile changes only when the user edits their own profile — the
// 5-minute cache gives other viewers a near-instant response without
// noticeably stale data for the owner (who edits then refreshes their own page).
export const revalidate = 300;
import handler from "../../../server-handlers/public-profile";

export async function POST(req: Request) { return handler(req); }
export async function GET(req: Request) { return handler(req); }
export async function OPTIONS(req: Request) { return handler(req); }
