import React, { useState } from 'react';

interface GuessProps {
  onGuess: () => void;
  hasGuessed: boolean;
}

const Guess: React.FC<GuessProps> = ({onGuess}) => {
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

export default Guess;