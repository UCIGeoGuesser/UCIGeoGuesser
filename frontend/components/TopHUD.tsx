import GameState from "./GameState";
import GameTimer from "./GameTimer";
import Results from "./results";


interface TopHUDProps {
  currRound: number,
  maxRounds: number,
  gameOver: boolean,
  hasGuessed: boolean,
  timeLimit: number,
  roundScore: number | null,
  sessionId: string | null,
  onTimerEnd?: () => void,
  onNextRound: () => void,
};

export default function TopHUD({currRound, maxRounds, gameOver, hasGuessed, timeLimit, roundScore, sessionId, onTimerEnd, onNextRound} : TopHUDProps) {
  return (
    <div className="absolute top-2 left-2 bg-gray-500/30 bg-opacity-90 px-2 py-1 rounded-2xl shadow-xl text-center w-full max-w-xs z-20">
      <GameState currRound={currRound} maxRounds={maxRounds}/>
      <div className="mt-2 text-white">
        {!gameOver && !hasGuessed ? (
          <GameTimer
            key={`${sessionId ?? "none"}-${currRound}`}
            timeLimitInSeconds={timeLimit}
            onEnd={onTimerEnd}
          />
        ) : null}
      </div>

      {hasGuessed && roundScore !== null && !gameOver && (
        <Results
          onNextImage={onNextRound}
          score={roundScore}
        />
      )}
    </div>
  );
}