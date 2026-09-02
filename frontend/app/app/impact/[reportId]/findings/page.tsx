import { ImpactReportRoute } from "../report-route";

export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  return <ImpactReportRoute params={params} view="findings" />;
}
