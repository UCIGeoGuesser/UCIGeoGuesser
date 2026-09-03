

interface GameOverProps {
    finalScore: number;
    onPlayAgain: () => void;
    onReturnHome: () => void;
}

export default function GameOver({finalScore, onPlayAgain, onReturnHome}: GameOverProps) {


    return (
        <div className='justify-center items-center text-center bg-gray-800 border border-white/30 rounded-xl p-8 max-w-md shadow-2xl'>
            <div className='font-bold'>Game Over!</div>
            <div className="font-bold">Final Score: {finalScore}</div>
            <button className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-green-500/30 drop-shadow-[1px_1px_0px_black] " onClick={onPlayAgain}>Play Again</button>
            <button className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-red-500/30 drop-shadow-[1px_1px_0px_black] " onClick={onReturnHome}>Return Home</button>
        </div>
    )
}