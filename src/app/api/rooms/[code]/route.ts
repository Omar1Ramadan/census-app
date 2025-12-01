import { NextResponse } from 'next/server';
import { getRoom, sanitizeRoomForClient } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function GET(_: Request, { params }: Params) {
  try {
    const { code } = await params;
    const room = await getRoom(code);
    return NextResponse.json(sanitizeRoomForClient(room));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch room';
    return NextResponse.json({ message }, { status: 404 });
  }
}
