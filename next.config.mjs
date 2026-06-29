/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["imap", "mailparser", "unpdf"],
  },
};

export default nextConfig;
