import { NextResponse } from "next/server";
import { getOrchestrationRuntimeDetails } from "../../_lib/orchestrationRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    orchestration: getOrchestrationRuntimeDetails()
  });
}
