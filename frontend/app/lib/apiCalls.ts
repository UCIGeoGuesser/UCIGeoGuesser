import { apiRouters, BASE_API_ROUTE, getMethod } from "./apiRoutes";
import { env } from "@/env/client";

type APICall = {
  route: apiRouters;
  signal?: AbortSignal;
  param?: string;
  payload?: Record<string, any>;
};

export default async function sendAPICall({
  route,
  signal,
  param,
  payload,
}: APICall): Promise<Record<string, any>> {

  const re: RegExp = /<param>/gi;
  const combinedPath: string =
    env.NEXT_PUBLIC_BACKEND_URL + BASE_API_ROUTE + route;

  if (combinedPath.match(re) && param === undefined) {
      throw new Error(`Invalid parameter for ${combinedPath}`);
  }
  const fullApiRoute = combinedPath.replace(re, param ? param : '');

  const res = await fetch(`${fullApiRoute}`, {
    method: getMethod(route),
    signal: signal ? signal : AbortSignal.timeout(4000), // Timeout after 4s
    headers: {
      "ngrok-skip-browser-warning": "true",
      "Content-Type": "application/json"
    },
    body: payload ? JSON.stringify(payload) : null,
  });

  if (!res.ok) throw new Error(`${fullApiRoute} returned status ${res.status}`);

  const data = await res.json();
  if (data) {
    return data;
  }
  throw new Error(`${fullApiRoute} returned no data`);
  

}
