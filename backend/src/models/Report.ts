import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IApprovalHistory {
  rowId?: string;
  rowIndex?: number;
  approvedBy: string;
  approvedAt: Date;
}

export interface IReport extends Document {
  reportId: string;
  name: string;
  type: string;
  source: string;
  owner: string;
  status: "Pending" | "Approved" | "Review" | "Inactive";
  rowsCount: number;
  data?: Record<string, unknown>[];
  approvals?: IApprovalHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalSchema = new Schema<IApprovalHistory>(
  {
    rowId: { type: String },
    rowIndex: { type: Number },
    approvedBy: { type: String, required: true },
    approvedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReportSchema = new Schema<IReport>(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    source: { type: String, required: true },
    owner: { type: String, required: true },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Review", "Inactive"],
      default: "Pending",
    },
    rowsCount: { type: Number, default: 0 },
    data: [Schema.Types.Mixed],
    approvals: [ApprovalSchema],
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration
export const ReportModel: Model<IReport> =
  (mongoose.connection.models["Report"] as Model<IReport>) ??
  model<IReport>("Report", ReportSchema);
