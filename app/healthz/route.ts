import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(): Promise<NextResponse> {
  return new NextResponse("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

