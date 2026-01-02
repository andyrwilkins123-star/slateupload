
// netlify/edge-functions/limit.ts
import type { Config, Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context) => {
  return;
};

export const config: Config = {
  path: "/*",
  rateLimit: {
    windowLimit: 100,
    windowSize: 60,
    aggregateBy: ["ip"],
  },
};