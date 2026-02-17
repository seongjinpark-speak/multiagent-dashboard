import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['chokidar'],
  allowedDevOrigins: ['127.0.2.2'],
}

export default nextConfig
