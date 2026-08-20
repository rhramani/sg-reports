import mongoose, { Schema, model, Document, Model } from "mongoose";

interface IUserNotificationPreferences {
  emailAlerts: boolean;
  approvalReminders: boolean;
  weeklyDigest: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: string;
  mobileNumber?: string;
  department?: string;
  avatar?: string;
  bio?: string;
  notifications?: IUserNotificationPreferences;
  lastActive: string;
  status: "Active" | "Pending" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, select: false },
    role: { type: String, required: true, default: "Report Analyst" },
    mobileNumber: { type: String, default: "" },
    department: { type: String, default: "" },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },
    notifications: {
      emailAlerts: { type: Boolean, default: true },
      approvalReminders: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false },
    },
    lastActive: { type: String, default: "Just now" },
    status: { type: String, enum: ["Active", "Pending", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration: reuse compiled model if it already exists
export const UserModel: Model<IUser> =
  (mongoose.connection.models["User"] as Model<IUser>) ??
  model<IUser>("User", UserSchema);
