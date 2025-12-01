export type RoomPhase = 'lobby' | 'question' | 'review' | 'complete';

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  isHost: boolean;
  /** Index of the question the player is currently on (during review phase) */
  currentQuestionIndex: number;
  /** Whether the player has finished voting on all questions */
  hasFinishedVoting: boolean;
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
  /** @deprecated Use player.currentQuestionIndex instead for self-paced voting */
  currentQuestionIndex: number;
  createdAt: number;
  players: Record<string, Player>;
  questions: Question[];
}
