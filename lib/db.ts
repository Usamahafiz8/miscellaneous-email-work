import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// NOTE: previously configured `ws` as the WebSocket implementation here for
// clearer Neon connection errors. Reverted — `ws`'s optional native
// `bufferutil` addon resolves to something broken in this environment and
// crashes every WebSocket send (`bufferUtil.mask is not a function`), which
// is strictly worse than the problem it was meant to help diagnose. Plain
// native WebSocket (the @neondatabase/serverless default) works correctly
// now that the actual root cause — a wrong system clock breaking TLS
// certificate validation — is fixed.
function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
