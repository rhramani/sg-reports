import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: string;
  lastActive: string;
  status: "Active" | "Pending" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, select: false },
    role: { type: String, required: true, default: "Report Analyst" },
    lastActive: { type: String, default: "Just now" },
    status: { type: String, enum: ["Active", "Pending", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration: reuse compiled model if it already exists
export const UserModel: Model<IUser> =
  (mongoose.connection.models["User"] as Model<IUser>) ??
  model<IUser>("User", UserSchema);
