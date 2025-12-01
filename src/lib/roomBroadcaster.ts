import type { Room } from '@/types/room';
import { getPusherServer } from './pusherServer';

export async function broadcastRoom(room: Room) {
  const pusher = getPusherServer();
  if (!pusher) {
    return;
  }

  try {
    await pusher.trigger(`room-${room.code}`, 'room-updated', { room });
  } catch (error) {
    console.error('Pusher trigger failed', error);
  }
}
