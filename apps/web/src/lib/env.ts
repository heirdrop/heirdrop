import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// https://env.t3.gg/docs/nextjs
export const env = createEnv({
  server: {
    JWT_SECRET: z.string().min(1).optional().default("build-time-placeholder"),
    CELO_RPC_URL: z.string().url().optional().default("https://alfajores-forno.celo-testnet.org"),
  },
  client: {
    NEXT_PUBLIC_URL: z.string().min(1).optional().default("http://localhost:3000"),
    NEXT_PUBLIC_APP_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("development"),
    NEXT_PUBLIC_FARCASTER_HEADER: z.string().min(1).optional().default("build-time-placeholder"),
    NEXT_PUBLIC_FARCASTER_PAYLOAD: z.string().min(1).optional().default("build-time-placeholder"),
    NEXT_PUBLIC_FARCASTER_SIGNATURE: z.string().min(1).optional().default("build-time-placeholder"),
    NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS: z.string().optional().default("0xdeaD5EE9Ea38d2aC5802FF9D76335DB3Eda0DEad"),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_FARCASTER_HEADER: process.env.NEXT_PUBLIC_FARCASTER_HEADER,
    NEXT_PUBLIC_FARCASTER_PAYLOAD: process.env.NEXT_PUBLIC_FARCASTER_PAYLOAD,
    NEXT_PUBLIC_FARCASTER_SIGNATURE: process.env.NEXT_PUBLIC_FARCASTER_SIGNATURE,
    NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_HEIRLOCK_CONTRACT_ADDRESS,
  },
});
