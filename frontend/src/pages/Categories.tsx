import { AppLayout } from "@/components/layout/AppLayout";
import { CategoryMasterView } from "@/components/master/CategoryMasterView";
import { useAppLayout } from "@/lib/AppLayoutContext";

function CategoriesContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Category");

  return <CategoryMasterView permissions={permissions} />;
}

export default function CategoriesPage() {
  return (
    <AppLayout>
      <CategoriesContent />
    </AppLayout>
  );
}
