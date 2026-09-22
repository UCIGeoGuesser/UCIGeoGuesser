"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import GameTimer from "@/components/GameTimer";
import GuessButton from "@/components/GuessButton";
import ChallengeResults from "../../ChallengeResults";
import { MAP_BUTTON_SLOT } from "../../lib/layout";
import {
  type ChallengePayload,
  type ChallengeRole,
  type GuessPayload,
  type RoundBreakdown,
} from "../../lib/challengeHelpers";
import sendAPICall from "@/app/lib/apiCalls";
import { apiRouters } from "@/app/lib/apiRoutes";
import { gameConfig } from "@/app/lib/gameConfig";
import Loading from "@/app/loading";

function storageKey(id: string, suffix: string) {
  return `ucigg:challenge:${id}:${suffix}`;
}

function resolveRole(id: string, queryRole: string | null): ChallengeRole {
  const stored =
    typeof window !== "undefined"
      ? localStorage.getItem(storageKey(id, "role"))
      : null;
  if (stored === "creator" || stored === "invitee") return stored;
  return "invitee";
}

function ChallengePageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const challengeId = params.id;

  const [role, setRole] = useState<ChallengeRole>("invitee");
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "share" | "playing" | "results"
  >("loading");

  const [roundIndex, setRoundIndex] = useState(0);
  const [guesses, setGuesses] = useState<GuessPayload[]>([]);
  const [guessCoords, setGuessCoords] = useState<[number, number] | null>(null);
  const [hasGuessed, setHasGuessed] = useState(false);
  const [pendingGuess, setPendingGuess] = useState<GuessPayload | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [roundBreakdowns, setRoundBreakdowns] = useState<
    RoundBreakdown[] | undefined
  >();
  const [copied, setCopied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const advancingRef = useRef(false);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/challenge/${challengeId}`;
  }, [challengeId]);

  const images = challenge?.images ?? [];
  const maxRounds = images.length;
  const currentImage = images[roundIndex];
  const opponentRole: ChallengeRole =
    role === "creator" ? "invitee" : "creator";

  const sendToMap = (msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  };

  const fetchChallenge = useCallback(async () => {
    // const res = await fetch(`${backendUrl}/api/challenges/${challengeId}`, {
    //   headers: apiHeaders(),
    // });
    // if (res.status === 404) throw new Error("Challenge not found.");
    // if (!res.ok) {
    //   const errData = await res.json().catch(() => null);
    //   throw new Error(errData?.error || `Server error: ${res.status}`);
    // }
    // return (await res.json()) as ChallengePayload;
    return (await sendAPICall({
      route: apiRouters.getChallenge,
      param: challengeId,
    })) as ChallengePayload;
  }, [challengeId]);

  useEffect(() => {
    if (!challengeId) return;
    let cancelled = false;
    const boot = async () => {
      try {
        const resolvedRole = resolveRole(challengeId, searchParams.get("role"));
        localStorage.setItem(storageKey(challengeId, "role"), resolvedRole);
        if (!cancelled) {
          setRole(resolvedRole);
          setLoadError(null);
        }

        const data = await fetchChallenge();
        if (cancelled) return;
        setChallenge(data);
        setLoadError(null);

        const myAttempt = data.attempts?.[resolvedRole];
        if (myAttempt?.completed) {
          setPhase("results");
          return;
        }

        const savedGuesses = sessionStorage.getItem(
          storageKey(challengeId, "guesses"),
        );
        const savedRound = sessionStorage.getItem(
          storageKey(challengeId, "round"),
        );
        if (savedGuesses) {
          try {
            setGuesses(JSON.parse(savedGuesses));
          } catch {
            /* ignore corrupt cache */
          }
        }
        if (savedRound) setRoundIndex(Number(savedRound) || 0);

        const started = sessionStorage.getItem(
          storageKey(challengeId, "started"),
        );
        if (resolvedRole === "creator" && !started) {
          setPhase("share");
        } else {
          setPhase("playing");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load challenge.",
          );
          setPhase("loading");
        }
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, [challengeId, fetchChallenge, searchParams]);

  useEffect(() => {
    if (phase !== "results") return;
    const opponentDone = Boolean(
      challenge?.attempts?.[opponentRole]?.completed,
    );
    if (opponentDone) return;
    const timer = setInterval(async () => {
      try {
        const data = await fetchChallenge();
        setChallenge(data);
      } catch {
        /* keep last known state */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, challenge?.attempts, opponentRole, fetchChallenge]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const msg = ev.data || {};
      if (
        msg?.type === "guess" &&
        typeof msg.lat === "number" &&
        typeof msg.lng === "number"
      ) {
        setGuessCoords([msg.lat, msg.lng]);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const persistProgress = (nextGuesses: GuessPayload[], nextRound: number) => {
    sessionStorage.setItem(
      storageKey(challengeId, "guesses"),
      JSON.stringify(nextGuesses),
    );
    sessionStorage.setItem(storageKey(challengeId, "round"), String(nextRound));
  };

  const finishChallenge = async (finalGuesses: GuessPayload[]) => {
    setSubmitting(true);
    try {
      // const res = await fetch(
      //   `${backendUrl}/api/challenges/${challengeId}/attempts`,
      //   {
      //     method: "POST",
      //     headers: apiHeaders(true),
      //     body: JSON.stringify({ role, guesses: finalGuesses }),
      //   },
      // );
      // const data = await res.json().catch(() => null);
      // if (!res.ok) {
      //   if (res.status === 409) {
      //     const refreshed = await fetchChallenge();
      //     setChallenge(refreshed);
      //     setPhase("results");
      //     return;
      //   }
      //   throw new Error(data?.error || `Server error: ${res.status}`);
      // }
      const data = await sendAPICall({
        route: apiRouters.finishChallenge,
        param: challengeId,
        payload: { role: role, guesses: finalGuesses },
      });
      setRoundBreakdowns(data.roundBreakdowns);
      const refreshed = await fetchChallenge();
      setChallenge(refreshed);
      sessionStorage.removeItem(storageKey(challengeId, "guesses"));
      sessionStorage.removeItem(storageKey(challengeId, "round"));
      setPhase("results");
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to submit challenge.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const advanceRound = async (maybeGuess: GuessPayload | null) => {
    if (advancingRef.current || phase !== "playing") return;
    advancingRef.current = true;

    const nextGuesses = maybeGuess
      ? [
          ...guesses.filter((g) => g.displayOrder !== maybeGuess.displayOrder),
          maybeGuess,
        ]
      : guesses;
    setGuesses(nextGuesses);
    setHasGuessed(true);

    const nextIndex = roundIndex + 1;
    if (nextIndex >= maxRounds) {
      persistProgress(nextGuesses, nextIndex);
      await finishChallenge(nextGuesses);
      advancingRef.current = false;
      return;
    }

    persistProgress(nextGuesses, nextIndex);
    setRoundIndex(nextIndex);
    setGuessCoords(null);
    setHasGuessed(false);
    setPendingGuess(null);
    sendToMap({
      type: "clear",
      center: gameConfig.mapCenter,
      zoom: gameConfig.mapZoom,
    });
    advancingRef.current = false;
  };

  const lockInGuess = (guess: GuessPayload | null) => {
    if (hasGuessed || advancingRef.current || phase !== "playing") return;
    setPendingGuess(guess);
    setHasGuessed(true);
  };

  const confirmGuess = () => {
    if (!guessCoords || !currentImage) return;
    lockInGuess({
      displayOrder: currentImage.displayOrder,
      lat: guessCoords[0],
      lng: guessCoords[1],
    });
  };

  const skipRound = () => {
    lockInGuess(null);
  };

  const goNext = () => {
    void advanceRound(pendingGuess);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== "playing" || submitting) return;
      if (event.code === "Space" && guessCoords && !hasGuessed) {
        event.preventDefault();
        confirmGuess();
      } else if (event.code === "Space" && hasGuessed && !submitting) {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, submitting, guessCoords, hasGuessed, currentImage]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (loadError && phase !== "results") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6 text-center">
        <div className="bg-gray-800 border border-red-500/30 rounded-xl p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-400 mb-2">
            Couldn’t load challenge
          </h1>
          <p className="text-gray-300 text-sm mb-6">{loadError}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 bg-red-600 hover:bg-red-500 transition text-white font-semibold rounded-lg"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading" || !challenge) {
    return <Loading />;
  }

  if (phase === "share") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-yellow-300 to-blue-950 text-white p-6 text-center">
        <h1 className="text-4xl font-extrabold mb-3">Challenge created</h1>
        <p className="max-w-md mb-4 text-white/90">
          Send this link to a friend. You both get the same {maxRounds} photos.
          Scores compare when you both finish.
        </p>
        <p className="bg-black/40 rounded-xl px-4 py-3 text-sm break-all max-w-lg mb-3">
          {shareUrl}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={copyLink}
            className="bg-white/20 font-bold py-3 px-6 rounded-xl hover:bg-white/30 transition"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => {
              sessionStorage.setItem(storageKey(challengeId, "started"), "1");
              setPhase("playing");
            }}
            className="bg-black font-bold py-3 px-6 rounded-xl hover:bg-blue-100 hover:text-black transition"
          >
            Play now
          </button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-yellow-300 to-blue-950 p-4">
        <ChallengeResults
          role={role}
          you={challenge.attempts?.[role] ?? null}
          opponent={challenge.attempts?.[opponentRole] ?? null}
          roundBreakdowns={roundBreakdowns}
          shareUrl={shareUrl}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full relative"
      style={{
        backgroundImage: currentImage
          ? `url(${currentImage.imageUrl})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f172a",
      }}
    >
      {submitting && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute top-2 left-2 bg-gray-500/30 px-2 py-1 rounded-2xl shadow-xl text-center w-full max-w-xs">
        <div className="flex justify-between items-center">
          <h1 className="text-white font-extrabold text-2xl drop-shadow">
            1v1 Challenge
          </h1>
          <div className="text-white text-lg">
            <span className="font-bold">Round: </span>
            {Math.min(roundIndex + 1, maxRounds)}/{maxRounds}
          </div>
        </div>
        {!hasGuessed && (
          <div className="mt-2 text-white">
            <GameTimer
              key={roundIndex}
              timeLimitInSeconds={gameConfig.timeLimit}
              onEnd={() => {
                if (!guessCoords) skipRound();
                else confirmGuess();
              }}
            />
          </div>
        )}
        {role === "creator" && (
          <button
            onClick={copyLink}
            className="mt-2 text-xs text-white/90 underline block mx-auto"
          >
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        )}
      </div>

      <div
        className="absolute bottom-2 right-2 transition-all duration-300 ease-in-out"
        style={{
          height: isHovering ? "500px" : "325px",
          width: isHovering ? "500px" : "325px",
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <iframe
          ref={iframeRef}
          src="/geoguess-map.html"
          style={{ height: "100%", width: "100%", border: 0, borderRadius: 8 }}
          title="GeoGuesser Map"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
        {(hasGuessed || guessCoords) && (
          <div
            style={{
              position: "absolute",
              bottom: "10%",
              left: "47%",
              transform: "translateX(-25%)",
              fontSize: 20,
              zIndex: 400,
            }}
          >
            <GuessButton
              onGuess={confirmGuess}
              moveToNextRound={goNext}
              hasGuessed={hasGuessed}
            />
          </div>
        )}
        {hasGuessed && !submitting && (
          <div style={MAP_BUTTON_SLOT}>
            <Results
              onNextImage={goNext}
              label={roundIndex + 1 >= maxRounds ? "Finish & compare" : "Next Image"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ChallengePageInner />
    </Suspense>
  );
}
