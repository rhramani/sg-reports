import { AppLayout } from "@/components/layout/AppLayout";
import { RateMasterView } from "@/components/courier/RateMasterView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function CourierRateMasterContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Rate Master");

  return <RateMasterView permissions={permissions} />;
}

export default function CourierRateMasterPage() {
  return (
    <AppLayout>
      <CourierRateMasterContent />
    </AppLayout>
  );
}
