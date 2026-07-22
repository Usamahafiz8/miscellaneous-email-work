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
