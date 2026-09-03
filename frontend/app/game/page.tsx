"use client";

import React, { useState, useEffect, useRef } from "react";

import Results from "@/components/results";
import Guess from "@/components/guess";
import GameTimer from "@/components/GameTimer";
import GameOver from "@/components/GameOver";
import ConnectionError from "@/components/ConnectionError";
import { useRouter } from "next/navigation";

export default function GameApp() {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || getBackendUrl();

  /* Router State */
  const router = useRouter();

  /* Health & Connection States */
  const [isServerHealthy, setIsServerHealthy] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  /* Use States */
  const [loading, setLoading] = useState<boolean>(true);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [guessCoords, setGuessCoords] = useState<[number, number] | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [hasGuessed, setHasGuessed] = useState<boolean>(false);

  /* Session state */
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roundScore, setRoundScore] = useState<number | null>(null);
  const [answerCoords, setAnswerCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);


  /* Map iframe ref */
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  /* Round / timer */
  const mapZoom: number = 14.5;
  const timeLimit: number = 60; // seconds
  const maxRounds: number = parseInt(process.env.NEXT_PUBLIC_MAX_ROUNDS || "5");
  const [currRound, setCurrRound] = useState<number>(0);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);

  /* helper to send message to iframe safely */
  const sendToMap = (msg: any) => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.postMessage(msg, "*");
    }
  };

  /* Health Check ping to backend */
  const checkServerHealth = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${backendUrl}/api/health_check`, {
        method: "GET",
        signal: AbortSignal.timeout(4000), // Timeout after 4s
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!res.ok)
        throw new Error(`Health check returned status ${res.status}`);

      const data = await res.json();
      if (data?.status === "ok") {
        setIsServerHealthy(true);
        setConnectionError(null);
        return true;
      }
      throw new Error("Invalid health check payload");
    } catch (err: any) {
      console.error("Health check failed:", err);
      setIsServerHealthy(false);
      setConnectionError(
        "Something went wrong on our end or your connection dropped.",
      );
      return false;
    }
  };

  const playAgain = () => {
    setHasGuessed(false);
    setGameOver(false);
    setLoading(true);
    setFinalScore(0);
    setCurrRound(0);
    setGuessCoords(null);
    setAnswerCoords(null);
    setRoundScore(null);
    startGame();
  };


  /* Start a new game by calling the backend */
  const startGame = async () => {
    setLoading(true);
    setHasGuessed(false);
    setGuessCoords(null);
    setRoundScore(null);
    setAnswerCoords(null);
    setCurrRound(0);


    // Run health check before attempting to initialize a session
    const healthy = await checkServerHealth();
    if (!healthy) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/start_game`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ totalRounds: maxRounds }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setCurrRound(data.round);
      setImageSrc(data.imageUrl);
      setLoading(false);

      // Clear iframe map markers for new game
      setTimeout(() => {
        sendToMap({
          type: "clear",
          center: [33.645934402549955, -117.84272074704859],
          zoom: mapZoom,
        });
      }, 100);
    } catch (err: any) {
      console.error("Failed to start game:", err);
      setIsServerHealthy(false);
      setConnectionError(err.message || "Unable to start game server session.");
      setLoading(false);
    }
  };

  /* Load the next round from the backend */
  const loadNextRound = async () => {
    if (!sessionId) return;

    setLoading(true);
    setHasGuessed(false);
    setGuessCoords(null);
    setRoundScore(null);
    setAnswerCoords(null);

    try {
      const res = await fetch(`${backendUrl}/api/get_round`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();

      if (data.gameOver) {
        setGameOver(true);
        setFinalScore(data.totalScore);
        setLoading(false);
        return;
      }

      setCurrRound(data.round);
      setImageSrc(data.imageUrl);
      setLoading(false);

      sendToMap({
        type: "clear",
        center: [33.645934402549955, -117.84272074704859],
        zoom: mapZoom,
      });
    } catch (err: any) {
      console.error("Failed to load round:", err);
      setIsServerHealthy(false);
      setConnectionError("Lost connection to backend server.");
      setLoading(false);
    }
  };

  /* Submit a guess to the backend */
  const submitGuess = async (lat: number, lng: number) => {
    if (!sessionId) return;

    try {
      const res = await fetch(`${backendUrl}/api/submit_guess`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ sessionId, lat, lng }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setRoundScore(data.score);
      setFinalScore(data.totalScore);
      setAnswerCoords({ lat: data.answerLat, lng: data.answerLng });
      setHasGuessed(true);

      if (data.gameOver) {
        setGameOver(true);
      }

      sendToMap({
        type: "lockAndShowAnswer",
        lat: data.answerLat,
        lng: data.answerLng,
      });
    } catch (err: any) {
      console.error("Failed to submit guess:", err);
      setIsServerHealthy(false);
      setConnectionError(
        "Failed to submit guess. Backend server is unreachable.",
      );
    }
  };

  /* Skip a round */
  const skipRound = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`${backendUrl}/api/skip_round`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setRoundScore(0);
      setFinalScore(data.totalScore);
      setAnswerCoords({ lat: data.answerLat, lng: data.answerLng });
      setHasGuessed(true);

      if (data.gameOver) {
        setGameOver(true);
      }

      sendToMap({
        type: "lockAndShowAnswer",
        lat: data.answerLat,
        lng: data.answerLng,
      });
    } catch (err: any) {
      console.error("Failed to skip round:", err);
      setIsServerHealthy(false);
      setConnectionError("Backend server disconnected.");
    }
  };

  const returnHome = () => {
    router.push("/");
  }

  /* Initial load */
  useEffect(() => {
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keyboard handlers */
  useEffect(() => {
    const KeyPressHandler = (event: KeyboardEvent) => {
      if (
        event.code === "Space" &&
        guessCoords &&
        !hasGuessed &&
        isServerHealthy
      ) {
        event.preventDefault();
        submitGuess(guessCoords[0], guessCoords[1]);
      } else if (
        event.code === "Enter" &&
        hasGuessed &&
        !gameOver &&
        isServerHealthy
      ) {
        event.preventDefault();
        loadNextRound();
      }
    };

    window.addEventListener("keydown", KeyPressHandler);
    return () => window.removeEventListener("keydown", KeyPressHandler);
  }, [guessCoords, hasGuessed, sessionId, gameOver, isServerHealthy]);

  /* Message from iframe (map) -> parent */
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const msg = ev.data || {};
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "guess":
          if (typeof msg.lat === "number" && typeof msg.lng === "number") {
            setGuessCoords([msg.lat, msg.lng]);
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* Connection Error Screen UI */
  if (isServerHealthy === false) {
    return (
      <ConnectionError
        message={connectionError || "Lost connection to backend server."}
        onRetry={() => {
          setIsServerHealthy(null);
          setConnectionError(null);
          startGame();
        }}
      />
    );
  }

  /* Regular Game View */
  return (
    <div
      className="min-h-screen w-full relative transition-opacity duration-500"
      style={{
        backgroundImage: `url(${imageSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f172a",
      }}
    >
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-10">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="min-h-screen flex flex-col items-center justify-center">
          {/* Top HUD */}
          <div className="absolute top-2 left-2 bg-gray-500/30 bg-opacity-90 px-2 py-1 rounded-2xl shadow-xl text-center w-full max-w-xs">
            <div className="flex justify-between items-center">
              <h1 className="text-white font-extrabold text-4xl drop-shadow-[px_1px_0px_black]">
                UCI GeoGuesser
              </h1>
              <div className="text-white text-lg">
                <div className="text-white">
                  <span className="font-bold">Round: </span>
                  <span>
                    {" "}
                    {currRound}/{maxRounds}{" "}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 text-white">
              {!gameOver && !hasGuessed ? (
                <GameTimer
                  timeLimitInSeconds={timeLimit}
                  onEnd={() => {
                    if (!guessCoords) {
                      // Timer expired with no guess — skip the round
                      skipRound();
                    } else {
                      // Timer expired but user had placed a pin — submit their guess
                      submitGuess(guessCoords[0], guessCoords[1]);
                    }
                  }}
                />
              ) : null}
            </div>

            {hasGuessed && roundScore !== null && !gameOver && (
              <div className="mt-2 text-white text-lg font-bold drop-shadow-[1px_1px_0px_black]">
                Score: {roundScore}
              </div>
            )}
          </div>

          {/* GameOver Stats*/}
          {gameOver && (
            <div className="items-center justify-center h-32 w-64 rounded-md">
              <div className="mt-2 text-white text-xl">
                <GameOver finalScore={finalScore} onPlayAgain={playAgain} onReturnHome={returnHome} />
              </div>
            </div>
          )}

          {/* iframe map in corner */}
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
              style={{
                height: "100%",
                width: "100%",
                border: 0,
                borderRadius: 8,
              }}
              title="GeoGuesser Map"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
            {guessCoords && !hasGuessed && (
              <div style={MAP_BUTTON_SLOT}>
                <Guess
                  onGuess={() => {
                    submitGuess(guessCoords[0], guessCoords[1]);
                  }}
                  hasGuessed={hasGuessed}
                />
              </div>
            )}
            {hasGuessed && !gameOver && (
              <div style={MAP_BUTTON_SLOT}>
                <Results
                  onNextImage={() => {
                    loadNextRound();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
