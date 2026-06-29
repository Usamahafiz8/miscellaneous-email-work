/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["imap", "mailparser"],
  },
};

export default nextConfig;
