
interface ResultsProps {
  onNextImage: () => void;
  label?: string;
}

export default function Results({ onNextImage, score }: ResultsProps) {
  return (
      <button
        onClick={onNextImage}
        className="bg-blue-500 text-white font-bold py-1 px-7 
        rounded-xl transition-colors duration-200 
        hover:bg-blue-700 drop-shadow-[1px_1px_0px_black]"
      >
        {label}
      </button>
  );
};
