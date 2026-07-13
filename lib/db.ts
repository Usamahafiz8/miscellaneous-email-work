import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Node's native WebSocket (the default @neondatabase/serverless picks in a
// plain Node process) reports connection failures as an opaque ErrorEvent
// with no message — e.g. a TLS certificate error just came through as
// "[object ErrorEvent]" with nothing else to go on. The `ws` package surfaces
// the actual underlying error (e.g. "certificate is not yet valid"), so
// failures here are diagnosable instead of a silent, useless 500.
neonConfig.webSocketConstructor = ws;

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
