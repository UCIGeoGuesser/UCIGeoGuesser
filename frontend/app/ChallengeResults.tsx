"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type {
  ChallengeAttempt,
  ChallengeRole,
  RoundBreakdown,
} from "./lib/challengeHelpers";

type ChallengeResultsProps = {
  role: ChallengeRole;
  you: ChallengeAttempt;
  opponent: ChallengeAttempt;
  roundBreakdowns?: RoundBreakdown[];
  shareUrl: string;
};

export default function ChallengeResults({
  role,
  you,
  opponent,
  roundBreakdowns,
  shareUrl,
}: ChallengeResultsProps) {
  const router = useRouter();
  const yourScore = you?.totalScore ?? 0;
  const opponentDone = Boolean(opponent?.completed);
  const opponentScore = opponent?.totalScore;
  const youWon =
    opponentDone && opponentScore !== undefined && yourScore > opponentScore;
  const tied =
    opponentDone && opponentScore !== undefined && yourScore === opponentScore;
  const youLost =
    opponentDone && opponentScore !== undefined && yourScore < opponentScore;
  const opponentLabel = role === "creator" ? "Friend" : "Host";

  return (
    <div className="bg-gray-900/80 border border-white/20 rounded-2xl p-6 w-full max-w-md text-white text-center shadow-2xl">
      <h2 className="text-3xl font-extrabold mb-2">Challenge complete</h2>
      <p className="text-4xl font-black mb-4">{yourScore}</p>
      <p className="text-white/80 mb-4">Your total score</p>

      {opponentDone ? (
        <div className="bg-white/10 rounded-xl p-4 mb-4">
          <p className="text-lg">
            {opponentLabel}: <span className="font-bold">{opponentScore}</span>
          </p>
          <p className="mt-2 font-bold text-xl">
            {youWon && "You win!"}
            {tied && "It's a tie!"}
            {youLost && `${opponentLabel} wins.`}
          </p>
        </div>
      ) : (
        <div className="bg-white/10 rounded-xl p-4 mb-4">
          <p className="font-semibold">Waiting for your friend…</p>
          <p className="text-sm text-white/70 mt-1">
            Send them this link. This page updates when they finish.
          </p>
          <p className="mt-2 text-xs text-yellow-200 overflow-x-auto whitespace-nowrap">{shareUrl}</p>
        </div>
      )}

      {roundBreakdowns && roundBreakdowns.length > 0 && (
        <ul className="text-left text-sm mb-4 space-y-1">
          {roundBreakdowns.map((round) => (
            <li key={round.displayOrder} className="flex justify-between">
              <span>Round {round.displayOrder}</span>
              <span className="font-semibold">{round.score}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        className="w-full bg-black text-white font-bold py-3 px-6 rounded-xl hover:bg-green-600 transition"
        onClick={() => router.push("/")}
      >
        Back to home
      </button>
    </div>
  );
}
