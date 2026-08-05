import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface ModulePermissionActions {
  view: boolean;
  add: boolean;
  update: boolean;
  delete: boolean;
  export: boolean;
}

export interface IModulePermission {
  module: string;
  actions: ModulePermissionActions;
}

export interface IRole extends Document {
  role: string;
  members: number;
  permissions?: string;
  modulePermissions?: IModulePermission[];
  created: string;
  status: "Active" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const ModulePermissionSchema = new Schema<IModulePermission>(
  {
    module: { type: String, required: true },
    actions: {
      view: { type: Boolean, default: true },
      add: { type: Boolean, default: false },
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      export: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const RoleSchema = new Schema<IRole>(
  {
    role: { type: String, required: true, unique: true },
    members: { type: Number, default: 1 },
    permissions: { type: String, default: "Standard Access" },
    modulePermissions: [ModulePermissionSchema],
    created: { type: String, default: "Today" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration
export const RoleModel: Model<IRole> =
  (mongoose.connection.models["Role"] as Model<IRole>) ??
  model<IRole>("Role", RoleSchema);

