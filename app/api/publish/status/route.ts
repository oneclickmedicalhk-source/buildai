import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET() {
  const c = await cookies()
  return NextResponse.json({
    githubConnected: Boolean(c.get("buildai_github")?.value),
    vercelConnected: Boolean(c.get("buildai_vercel")?.value),
  })
}

