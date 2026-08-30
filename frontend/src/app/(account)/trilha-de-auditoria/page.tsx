import { AuditTrailPage } from "@/components/audit-trail-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const query = (await searchParams).query;
  return <AuditTrailPage initialQuery={typeof query === "string" ? query.trim() : ""} />;
}
