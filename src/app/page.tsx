'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Chart, ArcElement, Legend, Tooltip } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import PusherClient from 'pusher-js';
import styles from './page.module.css';
import type { Player, Room } from '@/types/room';

if (typeof window !== 'undefined') {
  try {
    Chart.register(ArcElement, Tooltip, Legend);
  } catch {
    // Chart could already be registered during hot reloads.
  }
}

type Session = {
  roomCode: string;
  playerId: string;
};

type StatusMessage = { kind: 'success' | 'error'; text: string } | null;

const STORAGE_KEY = 'census-session';
const PIE_COLORS = ['#f97316', '#c084fc', '#34d399', '#38bdf8', '#fb7185', '#facc15', '#a3e635', '#f472b6'];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [hostName, setHostName] = useState('');
  const [questionDuration, setQuestionDuration] = useState(60);
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isRoomLoading, setIsRoomLoading] = useState(false);
  const [tick, setTick] = useState(Date.now());

  const isHost = Boolean(room && session && room.hostId === session.playerId);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      setRoom(null);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) {
      setRoom(null);
      setIsRoomLoading(false);
      setIsRealtimeConnected(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setIsRoomLoading(true);
        const response = await fetch(`/api/rooms/${session.roomCode}`, {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 404) {
            setSession(null);
            handleStatus({ kind: 'error', text: 'This room was closed by the host.' });
            return;
          }
          throw new Error(payload?.message ?? 'Unable to sync room');
        }
        if (!cancelled) {
          setRoom(payload as Room);
        }
      } catch (error) {
        if (!cancelled) {
          handleStatus({
            kind: 'error',
            text: error instanceof Error ? error.message : 'Unable to reach the server',
          });
        }
      } finally {
        if (!cancelled) {
          setIsRoomLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setIsRealtimeConnected(false);
      return;
    }

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.warn('Missing Pusher keys. Realtime updates disabled, using polling fallback.');
      return;
    }

    const client = new PusherClient(key, { cluster });
    const channelName = `room-${session.roomCode}`;
    const channel = client.subscribe(channelName);

    const handleRoomUpdate = (payload: { room: Room }) => {
      setRoom(payload.room);
    };
    const handleConnected = () => setIsRealtimeConnected(true);
    const handleDisconnected = () => setIsRealtimeConnected(false);

    channel.bind('room-updated', handleRoomUpdate);
    client.connection.bind('connected', handleConnected);
    client.connection.bind('disconnected', handleDisconnected);

    return () => {
      channel.unbind('room-updated', handleRoomUpdate);
      client.connection.unbind('connected', handleConnected);
      client.connection.unbind('disconnected', handleDisconnected);
      client.unsubscribe(channelName);
      client.disconnect();
      setIsRealtimeConnected(false);
    };
  }, [session]);

  // Polling fallback: auto-refresh room state when Pusher isn't connected
  useEffect(() => {
    if (!session || isRealtimeConnected) {
      return;
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/rooms/${session.roomCode}`, {
          cache: 'no-store',
        });
        if (response.ok) {
          const payload = await response.json();
          setRoom(payload as Room);
        } else if (response.status === 404) {
          setSession(null);
          handleStatus({ kind: 'error', text: 'This room was closed by the host.' });
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    const intervalId = window.setInterval(poll, 3000);
    return () => window.clearInterval(intervalId);
  }, [session, isRealtimeConnected]);

  const players = useMemo<Player[]>(() => {
    if (!room) return [];
    return Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  }, [room]);

  // Get current player's data
  const currentPlayer = room && session ? room.players[session.playerId] : undefined;
  const myQuestionIndex = currentPlayer?.currentQuestionIndex ?? 0;
  const hasFinishedVoting = currentPlayer?.hasFinishedVoting ?? false;

  // Current question is based on THIS player's progress, not room-wide
  const currentQuestion = room ? room.questions[myQuestionIndex] : undefined;
  
  // Count how many players have finished voting
  const playersFinished = useMemo(() => {
    if (!room) return 0;
    return Object.values(room.players).filter((p) => p.hasFinishedVoting).length;
  }, [room]);

  const questionSummaries = useMemo(() => {
    if (!room) return [];
    return room.questions.map((question) => {
      const counts = Object.values(question.votes).reduce<Record<string, number>>((acc, playerId) => {
        acc[playerId] = (acc[playerId] ?? 0) + 1;
        return acc;
      }, {});
      const winner = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
      const winnerPlayer = winner ? room.players[winner[0]] : undefined;
      return {
        question,
        totalVotes: Object.values(counts).reduce((sum, value) => sum + value, 0),
        winnerName: winnerPlayer ? winnerPlayer.name : undefined,
      };
    });
  }, [room]);

  const questionCountdown =
    room?.phase === 'question' && room.questionDeadline
      ? Math.max(0, Math.round((room.questionDeadline - tick) / 1000))
      : 0;

  const handleStatus = (next: StatusMessage) => {
    setStatus(next);
    if (next && typeof window !== 'undefined') {
      window.setTimeout(() => {
        setStatus((current) => (current === next ? null : current));
      }, 4000);
    }
  };

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message ?? 'Request failed');
    }
    return payload;
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setIsBusy(true);
      const payload = await postJson('/api/rooms', {
        hostName,
        questionDurationSeconds: questionDuration,
      });
      setSession({ roomCode: payload.room.code, playerId: payload.playerId });
      setRoom(payload.room as Room);
      setHostName('');
      handleStatus({ kind: 'success', text: `Room ${payload.room.code} created` });
    } catch (error) {
      handleStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Unable to create room',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setIsBusy(true);
      const code = joinCode.trim().toUpperCase();
      const payload = await postJson(`/api/rooms/${code}/join`, {
        name: joinName,
      });
      setSession({ roomCode: code, playerId: payload.playerId });
      setRoom(payload.room as Room);
      setJoinName('');
      handleStatus({ kind: 'success', text: `Joined room ${code}` });
    } catch (error) {
      handleStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Unable to join room',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const callRoomAction = async (
    path: string,
    body: Record<string, unknown>,
    successText?: string,
  ) => {
    if (!session) return;
    try {
      setIsBusy(true);
      const payload = await postJson(path, body);
      const updatedRoom = (payload?.room ?? payload) as Room;
      setRoom(updatedRoom);
      if (successText) {
        handleStatus({ kind: 'success', text: successText });
      }
    } catch (error) {
      handleStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !questionText.trim()) return;
    await callRoomAction(
      `/api/rooms/${session.roomCode}/submit-question`,
      {
        playerId: session.playerId,
        text: questionText,
      },
      'Question submitted',
    );
    setQuestionText('');
  };

  const handleVote = async (targetPlayerId: string, questionIndex: number) => {
    if (!session) return;
    await callRoomAction(
      `/api/rooms/${session.roomCode}/vote`,
      {
        playerId: session.playerId,
        targetPlayerId,
        questionIndex,
      },
      questionIndex === (room?.questions.length ?? 1) - 1
        ? 'All votes submitted!'
        : undefined,
    );
  };

  const handleCopyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      handleStatus({ kind: 'success', text: 'Room code copied to clipboard' });
    } catch {
      handleStatus({ kind: 'error', text: 'Unable to copy room code' });
    }
  };

  const clearSession = () => {
    setSession(null);
    setRoom(null);
    setJoinCode('');
    setJoinName('');
    setQuestionText('');
    setIsRealtimeConnected(false);
    setIsRoomLoading(false);
    handleStatus({ kind: 'success', text: 'Session cleared locally' });
  };

  const renderStage = () => {
    if (!room || !session) {
      return (
        <p className={styles.emptyState}>
          You have not joined a census yet. Create a squad or jump into an existing room.
        </p>
      );
    }

    if (room.phase === 'lobby') {
      return (
        <div className={styles.stageContent}>
          <h3>Waiting in the lobby</h3>
          <p>
            Share the room code with everyone you want to play with. Once the crew is ready the host
            can kick off the question window.
          </p>
          {isHost ? (
            <button
              type="button"
              className={styles.buttonPrimary}
              disabled={isBusy}
              onClick={() =>
                callRoomAction(
                  `/api/rooms/${room.code}/start-question`,
                  { playerId: session.playerId },
                  'Question window started',
                )
              }
            >
              Start collecting questions
            </button>
          ) : (
            <p className={styles.mutedText}>Hang tight—your host controls when the timer starts.</p>
          )}
        </div>
      );
    }

    if (room.phase === 'question') {
      return (
        <div className={styles.stageContent}>
          <div className={styles.timer}>
            <span>Question time remaining</span>
            <strong>{formatClock(questionCountdown)}</strong>
          </div>
          <form className={styles.questionForm} onSubmit={handleSubmitQuestion}>
            <label htmlFor="question-input">Add a question for the group</label>
            <textarea
              id="question-input"
              className={styles.textarea}
              value={questionText}
              maxLength={140}
              onChange={(event) => setQuestionText(event.target.value)}
              placeholder="Who is most likely to..."
              disabled={questionCountdown === 0 || isBusy}
              required
            />
            <button
              type="submit"
              className={styles.buttonPrimary}
              disabled={questionCountdown === 0 || !questionText.trim() || isBusy}
            >
              Submit question
            </button>
          </form>
          {isHost && (
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={room.questions.length === 0 || isBusy}
              onClick={() =>
                callRoomAction(
                  `/api/rooms/${room.code}/start-review`,
                  { playerId: session.playerId },
                  'Voting started',
                )
              }
            >
              Move to the voting round
            </button>
          )}
        </div>
      );
    }

    if (room.phase === 'review') {
      // Player has finished voting - show waiting screen
      if (hasFinishedVoting) {
        return (
          <div className={styles.stageContent}>
            <h3>You&apos;ve finished voting! 🗳️</h3>
            <p>
              Waiting for other players to finish. Results will appear once everyone has voted.
            </p>
            <div className={styles.progressInfo}>
              <span className={styles.progressLabel}>Voting progress</span>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${(playersFinished / players.length) * 100}%` }}
                />
              </div>
              <span className={styles.progressText}>
                {playersFinished} of {players.length} players done
              </span>
            </div>
            {isHost && (
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={isBusy}
                onClick={() =>
                  callRoomAction(
                    `/api/rooms/${room.code}/next-question`,
                    { playerId: session.playerId },
                    'Session ended',
                  )
                }
              >
                End voting early (show results)
              </button>
            )}
          </div>
        );
      }

      // Player is still voting
      if (!currentQuestion) {
        return (
          <p className={styles.emptyState}>Loading question...</p>
        );
      }

      return (
        <div className={styles.stageContent}>
          <div className={styles.questionMeta}>
            <span>
              Question {myQuestionIndex + 1} of {room.questions.length}
            </span>
            <strong>{currentQuestion.text}</strong>
          </div>
          <div className={styles.votingSection}>
            <p>Vote for the player that best fits this question.</p>
            <p className={styles.mutedText}>
              Your vote is private. Click a name to vote and move to the next question.
            </p>
            <div className={styles.voteButtons}>
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={styles.voteButton}
                  onClick={() => handleVote(player.id, myQuestionIndex)}
                  disabled={isBusy}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.progressInfo}>
            <span className={styles.progressLabel}>Your progress</span>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(myQuestionIndex / room.questions.length) * 100}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {myQuestionIndex} of {room.questions.length} answered
            </span>
          </div>
        </div>
      );
    }

    if (room.phase === 'complete') {
      return (
        <div className={styles.stageContent}>
          <h3>The census is complete 🎉</h3>
          <p>Here are the final results from your group census!</p>
          <div className={styles.resultsGrid}>
            {room.questions.map((question, index) => {
              const counts = Object.values(question.votes).reduce<Record<string, number>>(
                (acc, playerId) => {
                  acc[playerId] = (acc[playerId] ?? 0) + 1;
                  return acc;
                },
                {},
              );
              const sortedResults = Object.entries(counts)
                .map(([playerId, voteCount]) => ({
                  player: room.players[playerId],
                  voteCount,
                }))
                .filter((r) => r.player)
                .sort((a, b) => b.voteCount - a.voteCount);
              const totalVotes = Object.keys(question.votes).length;
              const winner = sortedResults[0];

              return (
                <div key={question.id} className={styles.resultCard}>
                  <div className={styles.resultHeader}>
                    <span className={styles.resultNumber}>Q{index + 1}</span>
                    <p className={styles.resultQuestion}>{question.text}</p>
                  </div>
                  {winner ? (
                    <div className={styles.resultWinner}>
                      <span className={styles.winnerLabel}>Winner</span>
                      <span className={styles.winnerName}>{winner.player.name}</span>
                      <span className={styles.winnerVotes}>
                        {winner.voteCount} of {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ) : (
                    <p className={styles.mutedText}>No votes cast</p>
                  )}
                  {sortedResults.length > 1 && (
                    <div className={styles.resultBreakdown}>
                      {sortedResults.map(({ player, voteCount }) => (
                        <div key={player.id} className={styles.resultBar}>
                          <div className={styles.resultBarInfo}>
                            <span>{player.name}</span>
                            <span>{voteCount}</span>
                          </div>
                          <div className={styles.resultBarTrack}>
                            <div
                              className={styles.resultBarFill}
                              style={{ width: `${(voteCount / totalVotes) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <p className={styles.emptyState}>
        Waiting for the host to share the next step. Grab a drink and stay tuned.
      </p>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.logo}>census</p>
            <h1>Group Census</h1>
            <p className={styles.subtitle}>
              Spin up a quick party room, collect spicy questions, then let everyone vote on who
              fits each prompt.
            </p>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.syncDot} data-active={isRealtimeConnected} />
            {isRealtimeConnected ? 'Live via Pusher' : 'Connecting…'}
          </div>
        </header>

        {status && (
          <div
            className={`${styles.statusBanner} ${
              status.kind === 'error' ? styles.statusError : styles.statusSuccess
            }`}
          >
            {status.text}
          </div>
        )}

        {!session && (
          <section className={styles.panels}>
            <article className={styles.panel}>
              <h2>Host a room</h2>
              <p>Pick a name and choose how long people have to submit their questions.</p>
              <form className={styles.form} onSubmit={handleCreateRoom}>
                <label>
                  Host name
                  <input
                    type="text"
                    required
                    value={hostName}
                    onChange={(event) => setHostName(event.target.value)}
                    placeholder="Alex"
                  />
                </label>
                <label>
                  Question window (seconds)
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={questionDuration}
                    onChange={(event) => setQuestionDuration(Number(event.target.value))}
                  />
                </label>
                <button type="submit" className={styles.buttonPrimary} disabled={isBusy}>
                  Create room
                </button>
              </form>
            </article>

            <article className={styles.panel}>
              <h2>Join a room</h2>
              <p>Enter the code the host shared with you and your display name.</p>
              <form className={styles.form} onSubmit={handleJoinRoom}>
                <label>
                  Room code
                  <input
                    type="text"
                    required
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="A1B2C"
                  />
                </label>
                <label>
                  Your name
                  <input
                    type="text"
                    required
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="Jordan"
                  />
                </label>
                <button type="submit" className={styles.buttonSecondary} disabled={isBusy}>
                  Join room
                </button>
              </form>
            </article>
          </section>
        )}

        {session && (
          <section className={styles.dashboard}>
            {room ? (
              <>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryRow}>
                    <span>Room code</span>
                    <div>
                      <span className={styles.codeBadge}>{room.code}</span>
                      <button type="button" className={styles.linkButton} onClick={handleCopyCode}>
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Phase</span>
                    <strong className={styles.phaseLabel}>{formatPhase(room.phase)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Question window</span>
                    <strong>{room.questionDurationSeconds}s</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>You are</span>
                    <strong>{isHost ? 'the host' : 'a player'}</strong>
                  </div>
                  <div className={styles.actionsRow}>
                    <button type="button" className={styles.buttonGhost} onClick={clearSession}>
                      Leave this room
                    </button>
                    {isHost && room.phase === 'review' && (
                      <button
                        type="button"
                        className={styles.buttonGhost}
                        onClick={() =>
                          callRoomAction(
                            `/api/rooms/${room.code}/complete`,
                            { playerId: session.playerId },
                            'Room closed',
                          )
                        }
                      >
                        End session
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.contentGrid}>
                  <article className={styles.stageCard}>{renderStage()}</article>
                  <aside className={styles.sideColumn}>
                    <div className={styles.card}>
                      <div className={styles.cardHeader}>
                        <h3>Players ({players.length})</h3>
                        {room.phase === 'review' && (
                          <span className={styles.mutedText}>
                            {playersFinished}/{players.length} done
                          </span>
                        )}
                      </div>
                      <ul className={styles.playersList}>
                        {players.map((player) => (
                          <li key={player.id} className={styles.playerItem}>
                            <span>{player.name}</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {player.isHost && <span className={styles.tag}>Host</span>}
                              {session?.playerId === player.id && (
                                <span className={styles.tag}>You</span>
                              )}
                              {room.phase === 'review' && (
                                <span
                                  className={styles.playerStatus}
                                  data-done={player.hasFinishedVoting}
                                >
                                  {player.hasFinishedVoting ? '✓ Done' : 'Voting...'}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.card}>
                      <div className={styles.cardHeader}>
                        <h3>Questions ({room.questions.length})</h3>
                      </div>
                      <div className={styles.questionsList}>
                        {room.questions.length === 0 && (
                          <p className={styles.mutedText}>No questions submitted yet.</p>
                        )}
                        {room.phase === 'lobby' || room.phase === 'question' ? (
                          room.questions.length > 0 && (
                            <p className={styles.mutedText}>
                              {room.questions.length} question{room.questions.length !== 1 ? 's' : ''} submitted.
                              Questions are hidden until voting begins.
                            </p>
                          )
                        ) : room.phase === 'review' ? (
                          <p className={styles.mutedText}>
                            {room.questions.length} question{room.questions.length !== 1 ? 's' : ''} to vote on.
                            Results will be revealed when voting ends.
                          </p>
                        ) : (
                          questionSummaries.map(({ question, totalVotes, winnerName }) => (
                            <div key={question.id} className={styles.questionItem}>
                              <p>{question.text}</p>
                              <div className={styles.questionStats}>
                                <span>{totalVotes} vote(s)</span>
                                {winnerName && <span className={styles.tag}>{winnerName}</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <p className={styles.emptyState}>
                {isRoomLoading
                  ? `Loading room ${session.roomCode}…`
                  : `Waiting for updates from room ${session.roomCode}. If this takes too long, clear the session and rejoin.`}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function formatPhase(phase: Room['phase']) {
  switch (phase) {
    case 'lobby':
      return 'Lobby';
    case 'question':
      return 'Collecting questions';
    case 'review':
      return 'Voting';
    case 'complete':
      return 'Complete';
    default:
      return phase;
  }
}

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}
