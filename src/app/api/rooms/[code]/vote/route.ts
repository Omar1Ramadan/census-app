import { NextResponse } from 'next/server';
import { submitVote, sanitizeRoomForClient } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = await request.json();
    const playerId = body?.playerId as string;
    const targetPlayerId = body?.targetPlayerId as string;
    const questionIndex = body?.questionIndex as number;
    
    if (typeof questionIndex !== 'number') {
      throw new Error('questionIndex is required');
    }
    
    const room = await submitVote(code, playerId, targetPlayerId, questionIndex);
    return NextResponse.json(sanitizeRoomForClient(room));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cast vote';
    return NextResponse.json({ message }, { status: 400 });
  }
}
