import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DynamicReportViewer } from "@/components/dashboard/DynamicReportViewer";
import { useAppLayout } from "@/lib/AppLayoutContext";

function ReportsContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Reports");
  const [query, setQuery] = useState("");

  return (
    <DynamicReportViewer
      query={query}
      setQuery={setQuery}
      permissions={permissions}
    />
  );
}

export default function ReportsPage() {
  return (
    <AppLayout>
      <ReportsContent />
    </AppLayout>
  );
}
