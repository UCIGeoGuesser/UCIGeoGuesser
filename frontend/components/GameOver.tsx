interface GameOverProps {
    finalScore: number;
    onPlayAgain: () => void;
    onReturnHome: () => void;
}

export default function GameOver({finalScore, onPlayAgain, onReturnHome}: GameOverProps) {
    return (
        <div className="flex flex-col items-center justify-center text-center bg-gray-800 border border-white/30 rounded-xl p-8 w-full max-w-md shadow-2xl gap-4">
            <div className="font-bold text-green-400 text-4xl">Game Over!</div>
            <div className="font-bold text-white text-xl">Final Score: <span className="text-yellow-400">{finalScore}</span></div>
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                <button
                    type="button"
                    className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-green-500/30 drop-shadow-[1px_1px_0px_black]"
                    onClick={onPlayAgain}
                >
                    Play Again
                </button>
                <button
                    type="button"
                    className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-red-500/30 drop-shadow-[1px_1px_0px_black]"
                    onClick={onReturnHome}
                >
                    Return Home
                </button>
            </div>
        </div>
    )
}
