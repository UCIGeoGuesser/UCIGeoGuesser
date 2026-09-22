

interface TopHUDProps {
  children: React.ReactNode,
};

export default function TopHUD({children} : TopHUDProps) {
  return (
    <div className="absolute top-2 left-2 bg-gray-500/30 bg-opacity-90 px-2 py-1 rounded-2xl shadow-xl text-center w-full max-w-xs z-20">
      {/* <GameState currRound={currRound} maxRounds={maxRounds}/>
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
      )} */}
      {children}

  </div>
  );
}