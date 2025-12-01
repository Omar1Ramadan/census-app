import { NextResponse } from 'next/server';
import { getRoom } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function GET(_: Request, { params }: Params) {
  try {
    const { code } = await params;
    const room = await getRoom(code);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch room';
    return NextResponse.json({ message }, { status: 404 });
  }
}
