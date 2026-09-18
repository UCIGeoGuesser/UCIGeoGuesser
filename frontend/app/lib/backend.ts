const DEFAULT_BACKEND_URL = "http://localhost:18080";

export function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (!url || url === "undefined") return DEFAULT_BACKEND_URL;
  return url.replace(/\/$/, "");
}

export function apiHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export const CHALLENGE_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractChallengeId(input: string): string | null {
  const match = input.trim().match(CHALLENGE_UUID_RE);
  return match ? match[0].toLowerCase() : null;
}

export type ChallengeRole = "creator" | "invitee";

export type ChallengeAttempt = {
  completed: boolean;
  totalScore?: number;
} | null;

export type ChallengeImage = {
  displayOrder: number;
  imageUrl: string;
};

export type ChallengePayload = {
  challengeId: string;
  totalRounds?: number;
  images: ChallengeImage[];
  attempts: {
    creator: ChallengeAttempt;
    invitee: ChallengeAttempt;
  };
};

export type GuessPayload = {
  displayOrder: number;
  lat: number;
  lng: number;
};

export type RoundBreakdown = {
  displayOrder: number;
  score: number;
  answerLat: number;
  answerLng: number;
};
