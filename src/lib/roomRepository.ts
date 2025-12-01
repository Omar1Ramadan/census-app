import type { Room } from '@/types/room';
import { getSupabaseAdminClient } from './supabaseAdmin';

const TABLE = 'room_states';

export async function loadRoom(code: string): Promise<Room | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('state')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('Failed to load room', error);
    throw new Error('Could not load room');
  }

  if (!data) {
    return null;
  }

  return data.state as Room;
}

export async function saveRoom(room: Room): Promise<Room> {
  const supabase = getSupabaseAdminClient();
  const payload = { code: room.code.toUpperCase(), state: room };
  const { error, data } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'code' })
    .select('state')
    .single();

  if (error) {
    console.error('Failed to save room', error);
    throw new Error('Could not persist room state');
  }

  return data.state as Room;
}

export async function deleteRoom(code: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from(TABLE).delete().eq('code', code.toUpperCase());
  if (error) {
    console.error('Failed to delete room', error);
    throw new Error('Could not delete room');
  }
}
