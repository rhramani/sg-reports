import { AppLayout } from "@/components/layout/AppLayout";
import { JewelleryTransactionMasterView } from "@/components/master/JewelleryTransactionMasterView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function JewelleryTransactionMasterContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions =
    getPermissionsForModule("Jewellery Transaction") ||
    getPermissionsForModule("Category") ||
    getPermissionsForModule("Master");

  return <JewelleryTransactionMasterView permissions={permissions} />;
}

export default function JewelleryTransactionMasterPage() {
  return (
    <AppLayout>
      <JewelleryTransactionMasterContent />
    </AppLayout>
  );
}
