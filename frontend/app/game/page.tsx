"use client";

import { useState, useEffect, useRef } from "react";

import GameOver from "@/components/GameOver";
import ConnectionError from "@/components/ConnectionError";
import sendAPICall from "../lib/apiCalls";
import Loading from "@/app/loading";
import { gameConfig } from "../lib/gameConfig";
import { useRouter } from "next/navigation";
import { apiRouters } from "../lib/apiRoutes";
import GameView from "@/components/GameView";
import TopHUD from "@/components/TopHUD";
import MiniMap from "@/components/MiniMap";
import GameState from "@/components/GameState";
import GameTimer from "@/components/GameTimer";
import Results from "@/components/results";
import ExpandView from "@/components/ExpandView";
import BotttomLeft from "@/components/BottomLeft";
import MiddleCenter from "@/components/MiddleCenter";


export default function GameApp() {
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

  /* Map iframe ref */
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const gameGenerationRef = useRef(0);
  const gameOverRef = useRef(false);

  /* Round Use States */
  const [currRound, setCurrRound] = useState<number>(0);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  gameOverRef.current = gameOver;

  const isCurrentGame = (generation: number, sid?: string | null) => {
    if (generation !== gameGenerationRef.current) return false;
    if (sid !== undefined && sessionIdRef.current !== sid) return false;
    return true;
  };

  /* helper to send message to iframe safely */
  const sendToMap = (msg: any) => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.postMessage(msg, "*");
    }
  };

  const resetMap = () => {
    setTimeout(() => {
      sendToMap({
        type: "clear",
        center: gameConfig.mapCenter,
        zoom: gameConfig.mapZoom,
      });
    }, 100);
  };

  /* Health Check ping to backend */
  const checkServerHealth = async (): Promise<boolean> => {
    try {
      const data = await sendAPICall({ route: apiRouters.healthCheck });

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
    startGame();
  };

  /* Start a new game by calling the backend */
  const startGame = async () => {
    gameGenerationRef.current += 1;
    const generation = gameGenerationRef.current;

    sessionIdRef.current = null;
    setSessionId(null);
    setLoading(true);
    setHasGuessed(false);
    setGameOver(false);
    setFinalScore(0);
    setCurrRound(0);
    setGuessCoords(null);
    setRoundScore(null);

    // Run health check before attempting to initialize a session
    const healthy = await checkServerHealth();
    if (!isCurrentGame(generation)) return;
    if (!healthy) {
      setLoading(false);
      return;
    }

    try {
      const data = await sendAPICall({
        route: apiRouters.startGame,
        payload: { totalRounds: gameConfig.maxRounds },
      });
      if (!isCurrentGame(generation)) return;

      sessionIdRef.current = data.sessionId;
      setSessionId(data.sessionId);
      setCurrRound(data.round);
      setImageSrc(data.imageUrl);
      setLoading(false);

      // Clear iframe map markers for new game
      resetMap();
    } catch (err: any) {
      if (!isCurrentGame(generation)) return;
      console.error("Failed to start game:", err);
      setIsServerHealthy(false);
      setConnectionError(err.message || "Unable to start game server session.");
      setLoading(false);
    }
  };

  /* Load the next round from the backend */
  const loadNextRound = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const generation = gameGenerationRef.current;

    setLoading(true);
    setHasGuessed(false);
    setGuessCoords(null);
    setRoundScore(null);

    try {
      const data = await sendAPICall({
        route: apiRouters.getRound,
        payload: { sessionId: sid },
      });
      if (!isCurrentGame(generation, sid)) return;

      if (data.gameOver) {
        setGameOver(true);
        setFinalScore(data.totalScore);
        setLoading(false);
        return;
      }

      setCurrRound(data.round);
      setImageSrc(data.imageUrl);
      setLoading(false);

      resetMap();
    } catch (err: any) {
      if (!isCurrentGame(generation, sid)) return;
      console.error("Failed to load round:", err);
      setIsServerHealthy(false);
      setConnectionError("Lost connection to backend server.");
      setLoading(false);
    }
  };

  /* Submit a guess to the backend */
  const submitGuess = async (lat: number, lng: number) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const generation = gameGenerationRef.current;

    try {
      const data = await sendAPICall({
        route: apiRouters.submitGuess,
        payload: { sessionId: sid, lat: lat, lng: lng },
      });
      if (!isCurrentGame(generation, sid)) return;

      setRoundScore(data.score);
      setFinalScore(data.totalScore);
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
      if (!isCurrentGame(generation, sid)) return;
      console.error("Failed to submit guess:", err);
      setIsServerHealthy(false);
      setConnectionError(
        "Failed to submit guess. Backend server is unreachable.",
      );
    }
  };

  /* Skip a round */
  const skipRound = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const generation = gameGenerationRef.current;

    try {
      const data = await sendAPICall({
        route: apiRouters.skipRound,
        payload: { sessionId: sid },
      });
      if (!isCurrentGame(generation, sid)) return;

      setRoundScore(0);
      setFinalScore(data.totalScore);
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
      if (!isCurrentGame(generation, sid)) return;
      console.error("Failed to skip round:", err);
      setIsServerHealthy(false);
      setConnectionError("Backend server disconnected.");
    }
  };

  function onTimerEnd(): void {
    if (!guessCoords) {
      // Timer expired with no guess — skip the round
      skipRound();
    } else {
      // Timer expired but user had placed a pin — submit their guess
      submitGuess(guessCoords[0], guessCoords[1]);
    }
  }

  function onGuess(): void {
    guessCoords && submitGuess(guessCoords[0], guessCoords[1]);
  }

  const returnHome = () => {
    router.push("/");
  };

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
        !gameOver &&
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
          if (gameOverRef.current) return;
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

  if (loading) {
    return <Loading />;
  }

  /* Regular Game View */
  return (
    <GameView imageSrc={imageSrc}>
      
      <TopHUD>
        <GameState currRound={currRound} maxRounds={gameConfig.maxRounds}/>
        {!gameOver && !hasGuessed && (
          <GameTimer
            key={`${sessionId ?? "none"}-${currRound}`}
            timeLimitInSeconds={gameConfig.timeLimit}
            className="mt-2 text-white"
            onEnd={onTimerEnd}
          />)
        }
        {hasGuessed && roundScore !== null && !gameOver && (
          <Results
            onNextImage={loadNextRound}
            score={roundScore}
          />
        )}
      </TopHUD>

      {/* iframe map in corner*/}
      <BotttomLeft>
        <ExpandView initialSize="h-80 w-80" expandedSize="group-hover:h-96 group-hover:w-96"  disableView={gameOver}>
          <MiniMap iframeRef={iframeRef}
                  gameOver={gameOver} 
                  hasGuessed={hasGuessed} 
                  guessCoords={guessCoords} 
                  onGuess={onGuess} 
                  loadNextRound={loadNextRound}
          />
        </ExpandView>
      </BotttomLeft>
        
      

      {gameOver && (
        <MiddleCenter bgColor="bg-black/60">
          <GameOver
            finalScore={finalScore}
            onPlayAgain={playAgain}
            onReturnHome={returnHome}
          />
        </MiddleCenter>
      )}
    </GameView>
  );
}
