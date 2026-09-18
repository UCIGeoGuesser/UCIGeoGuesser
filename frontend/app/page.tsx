"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import TitleScreen from "./TitleScreen";
import { extractChallengeId, getBackendUrl, apiHeaders } from "./lib/backend";

export default function Page() {
  const router = useRouter();
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const createChallenge = async () => {
    setCreatingChallenge(true);
    setJoinError(null);
    try {
      const backendUrl = getBackendUrl();
      const res = await fetch(`${backendUrl}/api/challenges`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ totalRounds: 8 }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      router.push(`/challenge/${data.challengeId}?role=creator`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to create challenge.";
      setJoinError(message);
      setCreatingChallenge(false);
    }
  };

  const joinChallenge = (input: string) => {
    const id = extractChallengeId(input);
    if (!id) {
      setJoinError("Paste a valid challenge link or ID.");
      return;
    }
    setJoinError(null);
    router.push(`/challenge/${id}?role=invitee`);
  };

  return (
    <TitleScreen
      onStart={() => router.push("/game")}
      onCreateChallenge={createChallenge}
      onJoinChallenge={joinChallenge}
      creatingChallenge={creatingChallenge}
      joinError={joinError}
    />
  );
}
