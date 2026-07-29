import { notFound } from "next/navigation";
import { ImpactReportPage } from "@/components/features/impact";
import {
  getAtlasImpactReport,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const [{ reportId }, { activeWorkspace }] = await Promise.all([
    params,
    getAtlasWorkspaceData(),
  ]);
  const report = await getAtlasImpactReport(
    activeWorkspace.id,
    reportId,
  ).catch(() => null);
  if (!report) notFound();
  return <ImpactReportPage report={report} />;
}
