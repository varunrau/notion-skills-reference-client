import { NextResponse } from "next/server";
import type { ApiError } from "./types";

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}

export function requireDemoToken(request: Request): Response | undefined {
  const expected = process.env.DEMO_API_TOKEN;
  if (!expected) return undefined;

  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return apiError(
      401,
      "unauthorized",
      "A valid Authorization: Bearer token is required.",
    );
  }

  return undefined;
}
