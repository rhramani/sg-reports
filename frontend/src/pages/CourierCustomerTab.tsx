import { AppLayout } from "@/components/layout/AppLayout";
import { CustomerTabView } from "@/components/courier/CustomerTabView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function CourierCustomerContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Customer Tab");

  return <CustomerTabView permissions={permissions} />;
}

export default function CourierCustomerPage() {
  return (
    <AppLayout>
      <CourierCustomerContent />
    </AppLayout>
  );
}
