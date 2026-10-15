import { AppLayout } from "@/components/layout/AppLayout";
import { ServiceProviderView } from "@/components/courier/ServiceProviderView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function CourierServiceProviderContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Service Provider");

  return <ServiceProviderView permissions={permissions} />;
}

export default function CourierServiceProviderPage() {
  return (
    <AppLayout>
      <CourierServiceProviderContent />
    </AppLayout>
  );
}
