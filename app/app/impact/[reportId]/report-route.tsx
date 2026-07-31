import { notFound } from "next/navigation";
import {
  ImpactReportPage,
  type ImpactReportView,
} from "@/components/features/impact";
import {
  getAtlasImpactReport,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export async function ImpactReportRoute({
  params,
  view,
}: {
  params: Promise<{ reportId: string }>;
  view: ImpactReportView;
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

  return <ImpactReportPage report={report} view={view} />;
}
