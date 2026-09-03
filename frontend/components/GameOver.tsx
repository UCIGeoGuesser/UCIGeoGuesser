import { redirect } from 'next/navigation';

export default function GameOver({finalScore}:any) {
    console.log('gameOver');
    return (
        <div className='justify-center items-center text-center'>
            <div className='font-bold'>Game Over!</div>
            <div className="font-bold">Final Score: {finalScore}</div>
            <button className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-green-500/30 drop-shadow-[1px_1px_0px_black] " onClick={()=>{redirect('/')}}>Play Again</button>
        </div>
    )
}