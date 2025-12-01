import { NextResponse } from 'next/server';
import { submitQuestion } from '@/lib/roomsStore';

interface Params {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { code } = await params;
    const body = await request.json();
    const playerId = body?.playerId as string;
    const text = body?.text as string;
    const room = await submitQuestion(code, playerId, text);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit question';
    return NextResponse.json({ message }, { status: 400 });
  }
}
