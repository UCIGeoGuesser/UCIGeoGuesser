import { env } from "@/env/client";

export const gameConfig = {
  mapZoom: 14.5,
  mapCenter: [33.645934402549955, -117.84272074704859],
  timeLimit: env.NEXT_PUBLIC_TIME_LIMIT,
  maxRounds: env.NEXT_PUBLIC_MAX_ROUNDS,
};
