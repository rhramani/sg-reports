import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IApprovalQueue extends Document {
  report: string;
  submittedBy: string;
  submitted: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Approved" | "Review";
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalQueueSchema = new Schema<IApprovalQueue>(
  {
    report: { type: String, required: true },
    submittedBy: { type: String, required: true },
    submitted: { type: String, default: "Today" },
    priority: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    status: { type: String, enum: ["Pending", "Approved", "Review"], default: "Pending" },
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration
export const ApprovalQueueModel: Model<IApprovalQueue> =
  (mongoose.connection.models["ApprovalQueue"] as Model<IApprovalQueue>) ??
  model<IApprovalQueue>("ApprovalQueue", ApprovalQueueSchema);
