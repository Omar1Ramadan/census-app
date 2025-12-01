export type RoomPhase = 'lobby' | 'question' | 'review' | 'complete';

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  isHost: boolean;
}

export interface Question {
  id: string;
  text: string;
  authorId: string;
  createdAt: number;
  votes: Record<string, string>;
}

export interface Room {
  code: string;
  hostId: string;
  phase: RoomPhase;
  questionDurationSeconds: number;
  questionDeadline?: number;
  currentQuestionIndex: number;
  createdAt: number;
  players: Record<string, Player>;
  questions: Question[];
}
