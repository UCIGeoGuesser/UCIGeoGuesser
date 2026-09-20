interface GameStateProps {
  currRound: number,
  maxRounds: number,
}

export default function GameState({currRound, maxRounds}: GameStateProps) {
  return (
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
  )
}