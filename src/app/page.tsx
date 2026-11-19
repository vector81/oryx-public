import { authenticated } from "@/lib/auth";
import Login from "@/components/login";
import Workspace from "@/components/workspace";
import { after } from "next/server";
import { drainAiSort } from "@/lib/ai-sort";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function Page() {
  if (!(await authenticated())) return <Login localPreview={process.env.NODE_ENV === "development"} />;
  after(async () => { await drainAiSort('all'); });
  return <Workspace />;
}
