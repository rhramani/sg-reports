import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface IJewelleryTransactionDoc extends Document {
  reportName: string;
  sourceFile: string;
  headers: string[];
  data?: Record<string, any>[];
  rowCount: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJewelleryTransactionItemDoc extends Document {
  reportId: mongoose.Types.ObjectId;
  fingerprint: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const JewelleryTransactionReportSchema = new Schema<IJewelleryTransactionDoc>(
  {
    reportName: { type: String, required: true, default: "Jewellery Transaction Report" },
    sourceFile: { type: String, default: "Uploaded_Sheet.xlsx" },
    headers: [String],
    rowCount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "Admin" },
  },
  { timestamps: true }
);

const JewelleryTransactionItemSchema = new Schema<IJewelleryTransactionItemDoc>(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "JewelleryTransactionReport", required: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const JewelleryTransactionReportModel: Model<IJewelleryTransactionDoc> =
  (mongoose.connection.models["JewelleryTransactionReport"] as Model<IJewelleryTransactionDoc>) ??
  model<IJewelleryTransactionDoc>("JewelleryTransactionReport", JewelleryTransactionReportSchema);

export const JewelleryTransactionItemModel: Model<IJewelleryTransactionItemDoc> =
  (mongoose.connection.models["JewelleryTransactionItem"] as Model<IJewelleryTransactionItemDoc>) ??
  model<IJewelleryTransactionItemDoc>("JewelleryTransactionItem", JewelleryTransactionItemSchema);
