import { NextRequest } from 'next/server';
import { refreshImsAttendance } from '../../../../lib/ims-attendance-flow';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) { return refreshImsAttendance(request); }
