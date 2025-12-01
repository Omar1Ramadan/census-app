import { NextResponse } from 'next/server';
import { submitVote } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = await request.json();
    const playerId = body?.playerId as string;
    const targetPlayerId = body?.targetPlayerId as string;
    const room = await submitVote(code, playerId, targetPlayerId);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cast vote';
    return NextResponse.json({ message }, { status: 400 });
  }
}
