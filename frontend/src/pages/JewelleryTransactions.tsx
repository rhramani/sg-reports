import { AppLayout } from "@/components/layout/AppLayout";
import { JewelleryTransactionReportView } from "@/components/jewellery/JewelleryTransactionReportView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function JewelleryTransactionsContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Jewellery Transaction");

  return <JewelleryTransactionReportView permissions={permissions} />;
}

export default function JewelleryTransactionsPage() {
  return (
    <AppLayout>
      <JewelleryTransactionsContent />
    </AppLayout>
  );
}
