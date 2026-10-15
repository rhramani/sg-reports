import mongoose, { Schema, model, Document, Model } from "mongoose";

// ── 1. Customer Tab Model ──────────────────────────────────────────────────
export interface ICourierCustomer extends Document {
  name: string;
  nameAsOnGst: string;
  gstNo: string;
  city: string;
  state: string;
  pincode: string;
  phone1: string;
  phone2: string;
  address: string;
  // Optional backwards compatibility
  phone?: string;
  gstin?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CourierCustomerSchema = new Schema<ICourierCustomer>(
  {
    name: { type: String, required: true, trim: true },
    nameAsOnGst: { type: String, default: "", trim: true },
    gstNo: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    pincode: { type: String, default: "", trim: true },
    phone1: { type: String, default: "", trim: true },
    phone2: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export const CourierCustomerModel: Model<ICourierCustomer> =
  (mongoose.connection.models["CourierCustomer"] as Model<ICourierCustomer>) ??
  model<ICourierCustomer>("CourierCustomer", CourierCustomerSchema);

// Drop legacy code_1 unique index if present so adding customers without code never conflicts
CourierCustomerModel.collection
  .dropIndex("code_1")
  .catch(() => {})
  .finally(() => {
    CourierCustomerModel.syncIndexes().catch(() => {});
  });

// ── 2. Rate Master Model ───────────────────────────────────────────────────
export interface ICourierRateMaster extends Document {
  title: string;
  rate: number;
  unit?: string;
  code?: string;
  status: "Active" | "Inactive";
  // Backwards compatibility fields
  serviceProvider?: string;
  zone?: string;
  serviceType?: string;
  weightSlab?: string;
  baseRate?: number;
  addlWeightRate?: number;
  codCharge?: number;
  docketFee?: number;
  valuationChargePercent?: number;
  fuelSurchargePercent?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CourierRateMasterSchema = new Schema<ICourierRateMaster>(
  {
    title: { type: String, default: "Gold Rate", trim: true },
    rate: { type: Number, required: true, default: 0 },
    unit: { type: String, default: "", trim: true },
    code: { type: String, default: "", trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    // Backwards compatibility defaults
    serviceProvider: { type: String, default: "", trim: true },
    zone: { type: String, default: "", trim: true },
    serviceType: { type: String, default: "", trim: true },
    weightSlab: { type: String, default: "", trim: true },
    baseRate: { type: Number, default: 0 },
    addlWeightRate: { type: Number, default: 0 },
    codCharge: { type: Number, default: 0 },
    docketFee: { type: Number, default: 0 },
    valuationChargePercent: { type: Number, default: 0 },
    fuelSurchargePercent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const CourierRateMasterModel: Model<ICourierRateMaster> =
  (mongoose.connection.models["CourierRateMaster"] as Model<ICourierRateMaster>) ??
  model<ICourierRateMaster>("CourierRateMaster", CourierRateMasterSchema);

// Drop legacy code_1 unique index if present so adding rates without code never conflicts
CourierRateMasterModel.collection.dropIndex("code_1").catch(() => {});

// ── 3. Service Provider Model ──────────────────────────────────────────────
export interface ICourierServiceProvider extends Document {
  name: string;
  description?: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  trackingUrlTemplate?: string;
  serviceTypes?: string[];
  accountNo?: string;
  city?: string;
  status?: "Active" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const CourierServiceProviderSchema = new Schema<ICourierServiceProvider>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    code: { type: String, default: "", trim: true },
    contactPerson: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    trackingUrlTemplate: { type: String, default: "", trim: true },
    serviceTypes: { type: [String], default: [] },
    accountNo: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

export const CourierServiceProviderModel: Model<ICourierServiceProvider> =
  (mongoose.connection.models["CourierServiceProvider"] as Model<ICourierServiceProvider>) ??
  model<ICourierServiceProvider>("CourierServiceProvider", CourierServiceProviderSchema);

// Drop legacy code_1 unique index if present so adding providers without code never conflicts
CourierServiceProviderModel.collection.dropIndex("code_1").catch(() => {});

// ── 4. Create Courier / Shipment Model ─────────────────────────────────────
export interface ICourierShipment extends Document {
  awbNumber: string;
  customerCode?: string;
  customerName: string;
  customerPhone?: string;
  customerPhone2?: string;
  destinationAddress?: string;
  destinationCity: string;
  destinationState?: string;
  destinationPincode?: string;
  serviceProvider: string;
  // New specific fields
  courierType: "Normal" | "VPP";
  qty: number;
  rate: number;
  totalAmount: number;
  billNo: string;
  paymentStatus: "Paid" | "Unpaid";
  insurance: number;
  grossWeight: number;
  boxWeight: number;
  fromSender: string;
  // Legacy / optional fields
  packageType?: string;
  weightKg?: number;
  boxCount?: number;
  declaredValue?: number;
  referenceNo?: string;
  shippingMode?: string;
  estimatedCost?: number;
  status: "Booked" | "In Transit" | "Out for Delivery" | "Delivered" | "Returned";
  specialInstructions?: string;
  bookedBy?: string;
  dispatchDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CourierShipmentSchema = new Schema<ICourierShipment>(
  {
    awbNumber: { type: String, required: true, trim: true },
    customerCode: { type: String, default: "", trim: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, default: "", trim: true },
    customerPhone2: { type: String, default: "", trim: true },
    destinationAddress: { type: String, default: "", trim: true },
    destinationCity: { type: String, default: "", trim: true },
    destinationState: { type: String, default: "", trim: true },
    destinationPincode: { type: String, default: "", trim: true },
    serviceProvider: { type: String, required: true, trim: true },
    // New fields
    courierType: { type: String, enum: ["Normal", "VPP"], default: "Normal" },
    qty: { type: Number, default: 1, min: 0 },
    rate: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    billNo: { type: String, default: "", trim: true },
    paymentStatus: { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },
    insurance: { type: Number, default: 0, min: 0 },
    grossWeight: { type: Number, default: 0, min: 0 },
    boxWeight: { type: Number, default: 0, min: 0 },
    fromSender: { type: String, default: "S G SURAT 9601511329 - 7405415105", trim: true },
    // Legacy fields
    packageType: { type: String, default: "Jewellery Box", trim: true },
    weightKg: { type: Number, default: 0.5, min: 0 },
    boxCount: { type: Number, default: 1, min: 1 },
    declaredValue: { type: Number, default: 0, min: 0 },
    referenceNo: { type: String, default: "", trim: true },
    shippingMode: { type: String, default: "Armoured Secured", trim: true },
    estimatedCost: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["Booked", "In Transit", "Out for Delivery", "Delivered", "Returned"],
      default: "Booked",
    },
    specialInstructions: { type: String, default: "", trim: true },
    bookedBy: { type: String, default: "Super Admin", trim: true },
    dispatchDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const CourierShipmentModel: Model<ICourierShipment> =
  (mongoose.connection.models["CourierShipment"] as Model<ICourierShipment>) ??
  model<ICourierShipment>("CourierShipment", CourierShipmentSchema);

// Drop legacy unique awbNumber_1 index if present
CourierShipmentModel.collection.dropIndex("awbNumber_1").catch(() => {});

// ── 5. Courier Settings Model (e.g. Default From Sender Line) ──────────────
export interface ICourierSetting extends Document {
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CourierSettingSchema = new Schema<ICourierSetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export const CourierSettingModel: Model<ICourierSetting> =
  (mongoose.connection.models["CourierSetting"] as Model<ICourierSetting>) ??
  model<ICourierSetting>("CourierSetting", CourierSettingSchema);
