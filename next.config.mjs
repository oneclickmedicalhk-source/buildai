/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /** Keep native/tooling out of the API route bundle (Turbopack cannot pack esbuild / lightningcss). */
  serverExternalPackages: [
    "esbuild",
    "tailwindcss",
    "@tailwindcss/postcss",
    "@tailwindcss/node",
    "@tailwindcss/oxide",
    "lightningcss",
    "postcss",
  ],
}

export default nextConfig
