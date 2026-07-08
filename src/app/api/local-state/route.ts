import { promises as fs } from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";

const stateDirectory = path.join(process.cwd(), ".local");
const stateFile = path.join(stateDirectory, "simple-pos-state.json");

export async function GET() {
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ state: null });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  await fs.mkdir(stateDirectory, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(body, null, 2), "utf8");

  return NextResponse.json({ ok: true });
}
