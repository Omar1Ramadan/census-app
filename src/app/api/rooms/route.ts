import { NextResponse } from 'next/server';
import { createRoom } from '@/lib/roomsStore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const hostName = body?.hostName as string;
    const questionDurationSeconds = Number(body?.questionDurationSeconds ?? 60);
    const { room, playerId } = await createRoom(hostName, questionDurationSeconds);
    return NextResponse.json({ room, playerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create room';
    return NextResponse.json({ message }, { status: 400 });
  }
}
