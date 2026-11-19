import { notFound } from "next/navigation";
import DesignStudio from "@/components/design-studio";

export default function DesignPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DesignStudio />;
}
