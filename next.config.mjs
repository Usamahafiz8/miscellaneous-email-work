// The `ws` package (used by lib/db.ts for clearer Neon connection errors)
// tries to load an optional native addon called `bufferutil` for a faster
// WebSocket frame-masking implementation. In this environment that addon
// resolves to something broken (not properly built for this Node version),
// which crashes every WebSocket send with "bufferUtil.mask is not a
// function" instead of failing to load cleanly. This is `ws`'s own
// documented escape hatch — it skips the native addon entirely and always
// uses its pure-JS masking, which is functionally identical, just not
// micro-optimized. Must be set before `ws` is ever imported, so it goes here
// (next.config.mjs runs before any app code or webpack compilation).
process.env.WS_NO_BUFFER_UTIL = "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev-only double-invoke of effects/renders — surfaces missing cleanup and
  // side-effect bugs (like the fetch race fixed in InboxView/HiringView/
  // CandidateSheetView) during development. No effect on production behavior.
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["imap", "mailparser", "unpdf"],
  },
};

export default nextConfig;
