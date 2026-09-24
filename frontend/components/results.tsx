
interface ResultsProps {
  onNextImage: () => void;
  score: number;
}

export default function Results({ onNextImage, score }: ResultsProps) {
  return (
      <button
        onClick={onNextImage}
        className="bg-gray text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 hover:bg-green-500/30 drop-shadow-[1px_1px_0px_black]"
      >
        Next Image (Score: {score})
      </button>
  );
};
