/**
 * In-memory coaching session records (QA Lead marks pack completed).
 * Wave-1 persistence — swap for DB table in a later hardening PR.
 */

export interface CoachingSessionRecord {
  id: string;
  engineerId: string;
  engineerName: string;
  periodStart: string;
  periodEnd: string;
  qaLeadUserId: number;
  qaLeadNote: string;
  narrativeOpening: string;
  coachingAsks: string[];
  completedAt: string;
}

const sessions = new Map<string, CoachingSessionRecord>();

function sessionId(
  engineerId: string,
  periodStart: string,
  periodEnd: string
): string {
  return `${engineerId}:${periodStart}:${periodEnd}`;
}

export function markCoachingSessionCompleted(input: {
  engineerId: string;
  engineerName: string;
  periodStart: string;
  periodEnd: string;
  qaLeadUserId: number;
  qaLeadNote: string;
  narrativeOpening: string;
  coachingAsks: string[];
}): CoachingSessionRecord {
  const id = sessionId(input.engineerId, input.periodStart, input.periodEnd);
  const record: CoachingSessionRecord = {
    id,
    engineerId: input.engineerId,
    engineerName: input.engineerName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    qaLeadUserId: input.qaLeadUserId,
    qaLeadNote: input.qaLeadNote.trim(),
    narrativeOpening: input.narrativeOpening,
    coachingAsks: input.coachingAsks,
    completedAt: new Date().toISOString(),
  };
  sessions.set(id, record);
  return record;
}

export function getCoachingSession(input: {
  engineerId: string;
  periodStart: string;
  periodEnd: string;
}): CoachingSessionRecord | null {
  return (
    sessions.get(
      sessionId(input.engineerId, input.periodStart, input.periodEnd)
    ) ?? null
  );
}
