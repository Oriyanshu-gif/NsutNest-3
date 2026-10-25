import { NextRequest } from 'next/server';
import { refreshImsAttendance } from '../attendance/route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) { return refreshImsAttendance(request); }
