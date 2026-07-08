import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";

  redirect(host.includes(":3001") ? "/owner" : "/login");
}
