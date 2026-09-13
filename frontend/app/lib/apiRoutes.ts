/// This file needs to be modified if new backend routes will be used by the frontend
/// Add the endpoint and method below.

export const BASE_API_ROUTE: string = '/api';

// All apiRouters in backend.
// For dynamic api routes use <param> to highlight dynamic portion of route.
export enum apiRouters {
  healthCheck = '/health_check',
  startGame = '/start_game',
  getRound = '/get_round',
  submitGuess = '/submit_guess',
  skipRound = '/skip_round',
  createChallenge = '/challenges',
  getChallenge = '/challenges/<param>',
  finishChallenge = '/challenges/<param>/attempts'
};

export function getMethod(route: apiRouters): string {
  switch (route) {
    case apiRouters.healthCheck:
      return 'GET';
    case apiRouters.startGame:
      return 'POST';
    case apiRouters.getRound:
      return 'POST';
    case apiRouters.submitGuess:
      return 'POST';
    case apiRouters.skipRound:
      return 'POST';
    case apiRouters.createChallenge:
      return 'POST';
    case apiRouters.getChallenge:
      return 'GET';
    case apiRouters.finishChallenge:
      return 'POST';
    default:
      throw new Error("Invalid API Route");
  }
}