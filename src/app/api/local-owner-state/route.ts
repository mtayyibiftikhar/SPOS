import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rejectOutsideLocalDevelopment } from "@/lib/server/local-development-only";

const LOCAL_STATE_PATH = path.join(process.cwd(), "_local_owner_state", "owner-state.json");

async function ensureStateDir() {
  await mkdir(path.dirname(LOCAL_STATE_PATH), { recursive: true });
}

export async function GET() {
  const rejection = rejectOutsideLocalDevelopment();
  if (rejection) return rejection;

  try {
    const raw = await readFile(LOCAL_STATE_PATH, "utf8");

    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ state: null });
  }
}

export async function POST(request: Request) {
  const rejection = rejectOutsideLocalDevelopment();
  if (rejection) return rejection;

  try {
    const payload = await request.json();

    await ensureStateDir();
    await writeFile(
      LOCAL_STATE_PATH,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          state: payload.state ?? payload
        },
        null,
        2
      ),
      "utf8"
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: "Unable to save local owner state." }, { status: 400 });
  }
}

export async function OPTIONS() {
  const rejection = rejectOutsideLocalDevelopment();
  return rejection ?? new Response(null, { status: 204 });
}
