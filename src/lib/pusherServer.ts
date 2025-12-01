import Pusher from 'pusher';

let client: Pusher | null | undefined;

export function getPusherServer() {
  if (client !== undefined) {
    return client;
  }

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    client = null;
    return client;
  }

  client = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return client;
}
