/** Vertex regional hostname for REST `v1` APIs. */
export function vertexRegionalHost(location: string): string {
  const loc = location.trim()
  if (loc === "global") return "aiplatform.googleapis.com"
  return `${loc}-aiplatform.googleapis.com`
}
