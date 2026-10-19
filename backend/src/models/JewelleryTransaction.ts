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

export interface IJewelleryTransactionRowDoc extends Document {
  reportId: mongoose.Types.ObjectId;
  rowIndex: number;
  rowFingerprint: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const JewelleryTransactionRowSchema = new Schema<IJewelleryTransactionRowDoc>(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "JewelleryTransactionReport", index: true },
    rowIndex: { type: Number, default: 0, index: true },
    rowFingerprint: { type: String, index: true },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

JewelleryTransactionRowSchema.index({ reportId: 1, rowFingerprint: 1 });
JewelleryTransactionRowSchema.index({ reportId: 1, rowIndex: 1 });

export const JewelleryTransactionRowModel: Model<IJewelleryTransactionRowDoc> =
  (mongoose.connection.models["JewelleryTransactionRow"] as Model<IJewelleryTransactionRowDoc>) ??
  model<IJewelleryTransactionRowDoc>("JewelleryTransactionRow", JewelleryTransactionRowSchema);

