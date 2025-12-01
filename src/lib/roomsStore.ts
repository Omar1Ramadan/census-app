import type { Player, Question, Room } from '@/types/room';
import { broadcastRoom } from './roomBroadcaster';
import { loadRoom, saveRoom } from './roomRepository';

const ROOM_CODE_LENGTH = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type { Player, Room } from '@/types/room';

/**
 * Sanitizes room data for client responses.
 * - Hides question text during lobby/question phases
 * - Hides votes during review phase (voting is private until complete)
 */
export function sanitizeRoomForClient(room: Room): Room {
  // During complete phase, show everything
  if (room.phase === 'complete') {
    return room;
  }

  // During review phase, show questions but hide all votes
  if (room.phase === 'review') {
    const questionsWithoutVotes: Question[] = room.questions.map((q) => ({
      ...q,
      votes: {}, // Hide votes until complete
    }));
    return {
      ...room,
      questions: questionsWithoutVotes,
    };
  }
  
  // During lobby/question phases, hide question details entirely
  const hiddenQuestions: Question[] = room.questions.map((q) => ({
    id: q.id,
    text: '',
    authorId: '',
    createdAt: q.createdAt,
    votes: {},
  }));

  return {
    ...room,
    questions: hiddenQuestions,
  };
}

async function persistAndBroadcast(room: Room) {
  const normalizedRoom: Room = { ...room, code: room.code.toUpperCase() };
  const saved = await saveRoom(normalizedRoom);
  // Broadcast sanitized version to clients
  await broadcastRoom(sanitizeRoomForClient(saved));
  return saved;
}

async function generateRoomCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = Array.from({ length: ROOM_CODE_LENGTH })
      .map(() => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)])
      .join('');
    const existing = await loadRoom(code);
    if (!existing) {
      return code;
    }
  }
  throw new Error('Unable to generate a unique room code');
}

async function assertRoomExists(code: string): Promise<Room> {
  const room = await loadRoom(code);
  if (!room) {
    throw new Error('Room not found');
  }
  return room;
}

function assertPlayer(room: Room, playerId: string): Player {
  const player = room.players[playerId];
  if (!player) {
    throw new Error('Player not in this room');
  }
  return player;
}

function assertHost(room: Room, playerId: string) {
  if (room.hostId !== playerId) {
    throw new Error('Only the host can perform this action');
  }
}

export async function createRoom(hostName: string, questionDurationSeconds: number) {
  if (!hostName?.trim()) {
    throw new Error('Host name is required');
  }
  const duration = Number.isFinite(questionDurationSeconds)
    ? Math.max(15, Math.min(300, Math.floor(questionDurationSeconds)))
    : 60;
  const code = await generateRoomCode();
  const hostId = crypto.randomUUID();
  const hostPlayer: Player = {
    id: hostId,
    name: hostName.trim(),
    joinedAt: Date.now(),
    isHost: true,
    currentQuestionIndex: 0,
    hasFinishedVoting: false,
  };
  const room: Room = {
    code,
    hostId,
    phase: 'lobby',
    questionDurationSeconds: duration,
    createdAt: Date.now(),
    currentQuestionIndex: 0,
    players: {
      [hostId]: hostPlayer,
    },
    questions: [],
  };
  const savedRoom = await persistAndBroadcast(room);
  return { room: savedRoom, playerId: hostId };
}

export async function joinRoom(code: string, name: string) {
  if (!name?.trim()) {
    throw new Error('Name is required');
  }
  const room = await assertRoomExists(code);
  const playerId = crypto.randomUUID();
  room.players[playerId] = {
    id: playerId,
    name: name.trim(),
    joinedAt: Date.now(),
    isHost: false,
    currentQuestionIndex: 0,
    hasFinishedVoting: false,
  };
  const savedRoom = await persistAndBroadcast(room);
  return { room: savedRoom, playerId };
}

export async function getRoom(code: string) {
  const room = await assertRoomExists(code);
  return room;
}

export async function startQuestionPhase(code: string, hostId: string) {
  const room = await assertRoomExists(code);
  assertHost(room, hostId);
  room.phase = 'question';
  room.questionDeadline = Date.now() + room.questionDurationSeconds * 1000;
  room.currentQuestionIndex = 0;
  return persistAndBroadcast(room);
}

export async function submitQuestion(code: string, playerId: string, text: string) {
  const room = await assertRoomExists(code);
  assertPlayer(room, playerId);
  if (room.phase !== 'question') {
    throw new Error('Room is not accepting questions right now');
  }
  if (room.questionDeadline && Date.now() > room.questionDeadline) {
    throw new Error('Question window has closed');
  }
  if (!text?.trim()) {
    throw new Error('Question cannot be empty');
  }
  room.questions.push({
    id: crypto.randomUUID(),
    text: text.trim(),
    authorId: playerId,
    createdAt: Date.now(),
    votes: {},
  });
  return persistAndBroadcast(room);
}

export async function startReviewPhase(code: string, hostId: string) {
  const room = await assertRoomExists(code);
  assertHost(room, hostId);
  if (room.questions.length === 0) {
    throw new Error('Add at least one question before reviewing');
  }
  room.phase = 'review';
  room.currentQuestionIndex = 0;
  // Reset all players to start voting from question 0
  for (const player of Object.values(room.players)) {
    player.currentQuestionIndex = 0;
    player.hasFinishedVoting = false;
  }
  return persistAndBroadcast(room);
}

export async function submitVote(code: string, playerId: string, targetPlayerId: string, questionIndex: number) {
  const room = await assertRoomExists(code);
  const player = assertPlayer(room, playerId);
  assertPlayer(room, targetPlayerId);
  if (room.phase !== 'review') {
    throw new Error('Voting is not active');
  }
  const question = room.questions[questionIndex];
  if (!question) {
    throw new Error('Invalid question');
  }
  // Record the vote
  question.votes[playerId] = targetPlayerId;
  
  // Move player to next question
  if (questionIndex < room.questions.length - 1) {
    player.currentQuestionIndex = questionIndex + 1;
  } else {
    player.hasFinishedVoting = true;
  }
  
  // Check if all players have finished voting
  const allFinished = Object.values(room.players).every((p) => p.hasFinishedVoting);
  if (allFinished) {
    room.phase = 'complete';
    room.questionDeadline = undefined;
  }
  
  return persistAndBroadcast(room);
}

/** @deprecated Use submitVote with questionIndex instead - players now vote at their own pace */
export async function goToNextQuestion(code: string, hostId: string) {
  const room = await assertRoomExists(code);
  assertHost(room, hostId);
  if (room.phase !== 'review') {
    throw new Error('Review phase has not started');
  }
  // This now just completes the room (host can end early)
  room.phase = 'complete';
  room.questionDeadline = undefined;
  return persistAndBroadcast(room);
}

export async function completeRoom(code: string, hostId: string) {
  const room = await assertRoomExists(code);
  assertHost(room, hostId);
  room.phase = 'complete';
  room.questionDeadline = undefined;
  return persistAndBroadcast(room);
}
