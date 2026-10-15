import { AppLayout } from "@/components/layout/AppLayout";
import { CreateCourierView } from "@/components/courier/CreateCourierView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function CourierCreateContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Create Courier");

  return <CreateCourierView permissions={permissions} />;
}

export default function CourierCreatePage() {
  return (
    <AppLayout>
      <CourierCreateContent />
    </AppLayout>
  );
}
