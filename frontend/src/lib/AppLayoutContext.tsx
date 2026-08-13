import { createContext, useContext } from "react";
import type { PermissionActions, UserSession } from "@shared/api";

export interface AppLayoutContextType {
  getPermissionsForModule: (module: string) => PermissionActions;
  userRole: string;
  currentUser: UserSession | null;
  refreshUserSession: () => void;
  navigateToModule: (moduleName: string, replace?: boolean) => void;
  profileTab: "details" | "security";
  setProfileTab: (tab: "details" | "security") => void;
}

const defaultPermissions: PermissionActions = {
  view: false,
  add: false,
  update: false,
  delete: false,
  export: false,
};

export const AppLayoutContext = createContext<AppLayoutContextType>({
  getPermissionsForModule: () => defaultPermissions,
  userRole: "",
  currentUser: null,
  refreshUserSession: () => {},
  navigateToModule: () => {},
  profileTab: "details",
  setProfileTab: () => {},
});

export const useAppLayout = () => useContext(AppLayoutContext);
