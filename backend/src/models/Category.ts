import mongoose, { Schema, model, Document, Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  baseMetal?: string;
  description?: string;
  costing?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    baseMetal: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    costing: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Compound index on name + baseMetal so each category + metal variant is unique
CategorySchema.index({ name: 1, baseMetal: 1 }, { unique: true });

export const CategoryModel: Model<ICategory> =
  (mongoose.connection.models["Category"] as Model<ICategory>) ??
  model<ICategory>("Category", CategorySchema);

// Sync indexes and drop legacy name_1 unique index if present
CategoryModel.collection
  .dropIndex("name_1")
  .catch(() => {})
  .finally(() => {
    CategoryModel.syncIndexes().catch(() => {});
  });
