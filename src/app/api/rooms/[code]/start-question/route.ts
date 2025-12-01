import { NextResponse } from 'next/server';
import { startQuestionPhase } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = await request.json();
    const hostId = body?.playerId as string;
    const room = await startQuestionPhase(code, hostId);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start question round';
    return NextResponse.json({ message }, { status: 400 });
  }
}
