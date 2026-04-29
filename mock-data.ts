import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { mockPipelineData } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";

const stageColors = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
];

export default function PipelineSummary() {
  const maxCount = Math.max(...mockPipelineData.map((s) => s.count));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Summary</CardTitle>
        <CardDescription>Leads by stage this month</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mockPipelineData.map((stage, idx) => (
          <div key={stage.stage} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{stage.stage}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{stage.count} leads</span>
                <span className="font-semibold text-foreground">${stage.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${stageColors[idx]} transition-all duration-700`}
                style={{ width: `${(stage.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
