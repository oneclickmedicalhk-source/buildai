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
  /**
   * Vercel output-file-tracing may omit transitive deps that are only resolved at runtime
   * (e.g. esbuild resolving "react/jsx-runtime" from the server preview bundler).
   * Force-include React packages for the preview bundle API route.
   *
   * App router route keys must be the route path (no /route suffix).
   */
  outputFileTracingIncludes: {
    "/api/preview-bundle": ["./node_modules/react/**", "./node_modules/react-dom/**"],
  },
}

export default nextConfig
