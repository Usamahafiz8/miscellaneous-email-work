/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["imap", "mailparser", "pdf-parse"],
  },
};

export default nextConfig;
