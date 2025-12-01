import { NextResponse } from 'next/server';
import { joinRoom, sanitizeRoomForClient } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = await request.json();
    const name = body?.name as string;
    const { room, playerId } = await joinRoom(code, name);
    return NextResponse.json({ room: sanitizeRoomForClient(room), playerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join room';
    return NextResponse.json({ message }, { status: 400 });
  }
}
