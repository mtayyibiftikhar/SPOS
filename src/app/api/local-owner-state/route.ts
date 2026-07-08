import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_STATE_PATH = path.join(process.cwd(), "_local_owner_state", "owner-state.json");

async function ensureStateDir() {
  await mkdir(path.dirname(LOCAL_STATE_PATH), { recursive: true });
}

export async function GET() {
  try {
    const raw = await readFile(LOCAL_STATE_PATH, "utf8");

    return NextResponse.json(JSON.parse(raw), {
      headers: {
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch {
    return NextResponse.json(
      { state: null },
      {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}

export async function POST(request: Request) {
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

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Unable to save local owner state." },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
