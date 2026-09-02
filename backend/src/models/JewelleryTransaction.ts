import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IJewelleryTransactionDoc extends Document {
  reportName: string;
  sourceFile: string;
  headers: string[];
  data: Record<string, any>[];
  rowCount: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const JewelleryTransactionReportSchema = new Schema<IJewelleryTransactionDoc>(
  {
    reportName: { type: String, required: true, default: "Jewellery Transaction Report" },
    sourceFile: { type: String, default: "Uploaded_Sheet.xlsx" },
    headers: [String],
    data: [Schema.Types.Mixed],
    rowCount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "Admin" },
  },
  { timestamps: true }
);

export const JewelleryTransactionReportModel: Model<IJewelleryTransactionDoc> =
  (mongoose.connection.models["JewelleryTransactionReport"] as Model<IJewelleryTransactionDoc>) ??
  model<IJewelleryTransactionDoc>("JewelleryTransactionReport", JewelleryTransactionReportSchema);
