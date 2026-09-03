import { useEffect, useRef, useState } from "react";

// timeLimitInSeconds is an integer in seconds
// onEnd (function) will be called when time reaches zero (but NOT during render)
function GameTimer({ timeLimitInSeconds, onEnd }) {
  // record the start time for accurate measurements
  const startRef = useRef(Date.now());

  // timeLeft is an integer number of seconds remaining
  const [timeLeft, setTimeLeft] = useState(() => timeLimitInSeconds);

  const intervalRef = useRef(null);

  // (re)start timer whenever timeLimitInSeconds changes
  useEffect(() => {
    // reset start time and visible time
    startRef.current = Date.now();
    setTimeLeft(timeLimitInSeconds);

    // clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // use a somewhat frequent tick so we don't skip 0 (250ms)
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.ceil(timeLimitInSeconds - elapsed);

      // update state using calculated remaining
      setTimeLeft(prev => {
        // if remaining <= 0, ensure we return 0 and clear interval
        if (remaining <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return remaining;
      });
    }, 250);

    // cleanup on unmount or when timeLimit changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timeLimitInSeconds]);

  // Call onEnd from an effect when timeLeft becomes 0.
  // This guarantees the call happens after render (safe).
  useEffect(() => {
    if (timeLeft <= 0) {
      // defer the call to avoid any render-time state updates issues in parent
      Promise.resolve().then(() => {
        onEnd?.();
      });
    }
  }, [timeLeft, onEnd]);

  if (timeLeft <= 0) {
    return null;
  }

  return <h1>{formatTime(timeLeft)}</h1>;
}

// Helpers (unchanged except ensure they're pure)
function timeLeftInSeconds(startTime, currentTime, timeLimitInSeconds) {
  return timeLimitInSeconds - (currentTime - startTime) / 1000;
}

function formatTime(time) {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  if (seconds < 10) {
    return minutes + ":0" + seconds;
  }
  return minutes + ":" + seconds;
}

export default GameTimer;
