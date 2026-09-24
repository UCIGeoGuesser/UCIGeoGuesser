import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_BACKEND_URL: z.string().min(1),
    NEXT_PUBLIC_MAX_ROUNDS: z.coerce.number().int().default(5),
    NEXT_PUBLIC_TIME_LIMIT: z.coerce.number().int().default(60),
  },

  runtimeEnv: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_MAX_ROUNDS: process.env.NEXT_PUBLIC_MAX_ROUNDS,
    NEXT_PUBLIC_TIME_LIMIT: process.env.NEXT_PUBLIC_TIME_LIMIT,
  },
});
