import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IReportType extends Document {
  name: string;
  code: string;
  reports: number;
  lastUpdated: string;
  status: "Active" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const ReportTypeSchema = new Schema<IReportType>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    reports: { type: Number, default: 0 },
    lastUpdated: { type: String, default: "Today" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

// Guard against Vite HMR re-registration
export const ReportTypeModel: Model<IReportType> =
  (mongoose.connection.models["ReportType"] as Model<IReportType>) ??
  model<IReportType>("ReportType", ReportTypeSchema);
