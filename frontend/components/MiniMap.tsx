import {Ref} from 'react';
import GuessButton from './GuessButton';

interface MiniMapProps {
  iframeRef: Ref<HTMLIFrameElement> | null, 
  gameOver: boolean,
  hasGuessed: boolean,
  guessCoords: [number, number] | null,
  onGuess: () => void,
  loadNextRound?: () => void,
};

export default function MiniMap({iframeRef, gameOver, hasGuessed, guessCoords, onGuess, loadNextRound}: MiniMapProps) {
  return (
    <>
      <iframe
        ref={iframeRef}
        src="/geoguess-map.html"
        style={{
          height: "100%",
          width: "100%",
          border: 0,
          borderRadius: 8,
        }}
        title="GeoGuesser Map"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
      {!gameOver && (hasGuessed || guessCoords) && (
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            left: "47%",
            transform: "translateX(-25%)",
            fontSize: 20,
            zIndex: 400,
          }}
        >
          <GuessButton
            onGuess={onGuess}
            moveToNextRound={loadNextRound}
            hasGuessed={hasGuessed}
          />
        </div>
      )}
    </>
  );
}