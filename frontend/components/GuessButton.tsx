import React, { useState } from 'react';

interface GuessButtonProps {
  onGuess: () => void;
  moveToNextRound?: () => void;
  hasGuessed: boolean;
}

export default function GuessButton({ onGuess, moveToNextRound, hasGuessed }: GuessButtonProps) {
  if (hasGuessed) {
    return (
      <button
        onClick={moveToNextRound}
        className="bg-green-500 text-white font-bold py-1 px-7 
        rounded-xl transition-colors duration-200 
        hover:bg-green-700 drop-shadow-[1px_1px_0px_black]"
      >
        Next Round
      </button>
    );
  }
  return (
      <button
        onClick={onGuess}
        className="bg-green-500 text-white font-bold py-1 px-7 
        rounded-xl transition-colors duration-200 
        hover:bg-green-700 drop-shadow-[1px_1px_0px_black]"
      >
        Guess
      </button>
  )};
