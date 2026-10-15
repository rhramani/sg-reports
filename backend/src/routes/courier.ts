import { Router, Request, Response } from "express";
import {
  CourierCustomerModel,
  CourierRateMasterModel,
  CourierServiceProviderModel,
  CourierShipmentModel,
  CourierSettingModel,
} from "../models/Courier";
import { logActivity } from "../utils/auditLogger";

export const courierRouter = Router();



// Helper to clean up legacy dummy shipments and ensure no fake data exists
async function ensureCourierDataSeeded() {
  try {
    await CourierShipmentModel.deleteMany({
      awbNumber: { $in: ["AWB-SG-20261014-001", "AWB-SG-20261014-002", "AWB-SG-20261014-003"] },
    });
  } catch (err) {
    console.warn("Courier clean notice:", err);
  }
}

// Trigger initial cleanup
ensureCourierDataSeeded().catch(() => {});

// ── CUSTOMERS (Customer Tab) ENDPOINTS ──────────────────────────────────────
courierRouter.get("/customers", async (_req: Request, res: Response) => {
  try {
    await ensureCourierDataSeeded();
    const customers = await CourierCustomerModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data: customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch customers" });
  }
});

courierRouter.post("/customers", async (req: Request, res: Response) => {
  try {
    const { name, nameAsOnGst, gstNo, city, state, pincode, phone1, phone2, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }

    const customer = await CourierCustomerModel.create({
      name: name.trim(),
      nameAsOnGst: (nameAsOnGst || "").trim(),
      gstNo: (gstNo || "").trim(),
      city: (city || "").trim(),
      state: (state || "").trim(),
      pincode: (pincode || "").trim(),
      phone1: (phone1 || "").trim(),
      phone2: (phone2 || "").trim(),
      address: (address || "").trim(),
    });

    logActivity(req as any, {
      module: "Customer Tab",
      section: "Courier Customers",
      action: "Add",
      details: "Created customer " + customer.name,
    });
    res.status(201).json({ success: true, data: customer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to create customer" });
  }
});

courierRouter.put("/customers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, nameAsOnGst, gstNo, city, state, pincode, phone1, phone2, address } = req.body;

    const customer = await CourierCustomerModel.findByIdAndUpdate(
      id,
      {
        ...(name && { name: name.trim() }),
        nameAsOnGst: (nameAsOnGst || "").trim(),
        gstNo: (gstNo || "").trim(),
        city: (city || "").trim(),
        state: (state || "").trim(),
        pincode: (pincode || "").trim(),
        phone1: (phone1 || "").trim(),
        phone2: (phone2 || "").trim(),
        address: (address || "").trim(),
      },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    logActivity(req as any, {
      module: "Customer Tab",
      section: "Courier Customers",
      action: "Update",
      details: "Updated customer " + customer.name,
    });
    res.json({ success: true, data: customer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update customer" });
  }
});

courierRouter.delete("/customers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await CourierCustomerModel.findByIdAndDelete(id);
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
    logActivity(req as any, {
      module: "Customer Tab",
      section: "Courier Customers",
      action: "Delete",
      details: "Deleted customer " + customer.name,
    });
    res.json({ success: true, message: "Customer deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to delete customer" });
  }
});

// ── RATE MASTER ENDPOINTS (SINGLE GOLD RATE ONLY) ───────────────────────────
courierRouter.get("/rate-masters", async (_req: Request, res: Response) => {
  try {
    await ensureCourierDataSeeded();
    // Fetch all existing rate records
    const allRates = await CourierRateMasterModel.find().sort({ updatedAt: -1, createdAt: -1 });

    if (allRates.length > 0) {
      // Pick the most recent one to keep as "Gold Rate"
      const keepRate = allRates[0];
      if (keepRate.title !== "Gold Rate" || keepRate.serviceProvider !== "Gold Rate") {
        keepRate.title = "Gold Rate";
        keepRate.serviceProvider = "Gold Rate";
        await keepRate.save();
      }
      // Delete any other rate records so strictly ONLY ONE card exists
      if (allRates.length > 1) {
        await CourierRateMasterModel.deleteMany({ _id: { $ne: keepRate._id } });
      }
      return res.json({ success: true, data: [keepRate] });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch rate masters" });
  }
});

courierRouter.post("/rate-masters", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const rawRate = body.rate !== undefined ? body.rate : body.baseRate;
    const rateNum = Number(rawRate);

    if (rawRate === undefined || rawRate === "" || isNaN(rateNum) || rateNum < 0) {
      return res.status(400).json({ success: false, error: "Please enter a valid rate amount (e.g. 150000)" });
    }

    const title = "Gold Rate";
    const unit = (body.unit || "").trim();
    const status = "Active";

    // If a rate already exists, REPLACE it so we have only one card
    const existingRate = await CourierRateMasterModel.findOne().sort({ updatedAt: -1 });
    let savedRate;

    if (existingRate) {
      existingRate.title = title;
      existingRate.serviceProvider = title;
      existingRate.rate = rateNum;
      existingRate.baseRate = rateNum;
      if (unit) existingRate.unit = unit;
      existingRate.status = status;
      savedRate = await existingRate.save();

      // Clean up any extra rates to guarantee only one card
      await CourierRateMasterModel.deleteMany({ _id: { $ne: existingRate._id } });
    } else {
      savedRate = await CourierRateMasterModel.create({
        title,
        rate: rateNum,
        unit,
        code: `RATE-${Date.now().toString().slice(-4)}`,
        status,
        baseRate: rateNum,
        serviceProvider: title,
        zone: "Pan-India",
        serviceType: "Standard",
        weightSlab: "Standard",
      });
    }

    logActivity(req as any, {
      module: "Rate Master",
      section: "Current Rates",
      action: existingRate ? "Update" : "Add",
      details: `Saved Gold Rate at ₹${savedRate.rate}`,
    });
    res.status(201).json({ success: true, data: savedRate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to save rate" });
  }
});

courierRouter.put("/rate-masters/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const rateNum = Number(body.rate !== undefined ? body.rate : body.baseRate) || 0;

    const rate = await CourierRateMasterModel.findByIdAndUpdate(
      id,
      {
        title: "Gold Rate",
        serviceProvider: "Gold Rate",
        rate: rateNum,
        baseRate: rateNum,
        ...(body.unit !== undefined && { unit: (body.unit || "").trim() }),
      },
      { new: true }
    );
    if (!rate) {
      return res.status(404).json({ success: false, error: "Rate not found" });
    }

    // Ensure no other rates exist
    await CourierRateMasterModel.deleteMany({ _id: { $ne: rate._id } });

    logActivity(req as any, {
      module: "Rate Master",
      section: "Current Rates",
      action: "Update",
      details: `Updated Gold Rate to ₹${rate.rate}`,
    });
    res.json({ success: true, data: rate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update rate" });
  }
});

courierRouter.delete("/rate-masters/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rate = await CourierRateMasterModel.findByIdAndDelete(id);
    if (!rate) {
      return res.status(404).json({ success: false, error: "Rate not found" });
    }
    // Also delete any other remaining records
    await CourierRateMasterModel.deleteMany({});

    logActivity(req as any, {
      module: "Rate Master",
      section: "Current Rates",
      action: "Delete",
      details: `Deleted Gold Rate (₹${rate.rate})`,
    });
    res.json({ success: true, message: "Gold Rate deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to delete rate" });
  }
});

// ── COURIER SETTINGS: DEFAULT FROM SENDER (PRINT LINE) ─────────────────────
courierRouter.get("/settings/from-sender", async (_req: Request, res: Response) => {
  try {
    const setting = await CourierSettingModel.findOne({ key: "from_sender" });
    const value = setting?.value || "From :- S G SURAT 9601511329 - 7405415105";
    res.json({ success: true, data: { value } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to load sender setting" });
  }
});

courierRouter.post("/settings/from-sender", async (req: Request, res: Response) => {
  try {
    const { value } = req.body || {};
    const cleanValue = (value || "").trim();
    if (!cleanValue) {
      return res.status(400).json({ success: false, error: "From Sender line cannot be empty" });
    }

    const updated = await CourierSettingModel.findOneAndUpdate(
      { key: "from_sender" },
      { key: "from_sender", value: cleanValue, description: "Default From Sender Line for Courier Slips" },
      { upsert: true, returnDocument: "after" }
    );

    logActivity(req as any, {
      module: "Rate Master",
      section: "Sender Settings",
      action: "Update",
      details: `Updated default sender line to "${cleanValue}"`,
    });

    res.json({ success: true, data: { value: updated?.value || cleanValue } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to save sender setting" });
  }
});

// ── SERVICE PROVIDERS ENDPOINTS ─────────────────────────────────────────────
courierRouter.get("/service-providers", async (_req: Request, res: Response) => {
  try {
    await ensureCourierDataSeeded();
    const providers = await CourierServiceProviderModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data: providers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch service providers" });
  }
});

courierRouter.post("/service-providers", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const { name, description } = body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Service provider name is required" });
    }

    const code = body.code?.trim() || `SP-${Date.now().toString().slice(-4)}`;

    const provider = await CourierServiceProviderModel.create({
      code,
      name: name.trim(),
      description: (description || "").trim(),
      status: "Active",
    });

    logActivity(req as any, {
      module: "Service Provider",
      section: "Courier Partners",
      action: "Add",
      details: `Added service provider ${provider.name}`,
    });
    res.status(201).json({ success: true, data: provider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to create service provider" });
  }
});

courierRouter.put("/service-providers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { name, description } = body;

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();

    const provider = await CourierServiceProviderModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!provider) {
      return res.status(404).json({ success: false, error: "Service provider not found" });
    }

    logActivity(req as any, {
      module: "Service Provider",
      section: "Courier Partners",
      action: "Update",
      details: `Updated service provider ${provider.name}`,
    });
    res.json({ success: true, data: provider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update service provider" });
  }
});

courierRouter.delete("/service-providers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await CourierServiceProviderModel.findByIdAndDelete(id);
    if (!provider) {
      return res.status(404).json({ success: false, error: "Service provider not found" });
    }
    logActivity(req as any, {
      module: "Service Provider",
      section: "Courier Partners",
      action: "Delete",
      details: `Deleted service provider ${provider.name}`,
    });
    res.json({ success: true, message: "Service provider deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to delete service provider" });
  }
});

// ── SHIPMENTS (Create Courier) ENDPOINTS ────────────────────────────────────
courierRouter.get("/shipments", async (_req: Request, res: Response) => {
  try {
    await ensureCourierDataSeeded();
    const shipments = await CourierShipmentModel.find().sort({ createdAt: -1 });
    res.json({ success: true, data: shipments });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch courier shipments" });
  }
});

courierRouter.post("/shipments", async (req: Request, res: Response) => {
  try {
    const {
      serviceProvider,
      customerName,
      destinationCity = "",
      customerPhone = "",
      customerPhone2 = "",
      destinationAddress = "",
      destinationState = "",
      destinationPincode = "",
      customerCode = "",
      courierType = "Normal",
      qty = 1,
      rate = 0,
      totalAmount = 0,
      billNo = "",
      paymentStatus = "Unpaid",
      insurance = 10000,
      grossWeight = 0,
      boxWeight = 0,
      fromSender = "S G SURAT 9601511329 - 7405415105",
      packageType = "Jewellery Box",
      shippingMode = "Armoured Secured",
      status = "Booked",
      specialInstructions = "",
      bookedBy = "Admin",
    } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ success: false, error: "Recipient / Customer name is required" });
    }
    if (!serviceProvider || !serviceProvider.trim()) {
      return res.status(400).json({ success: false, error: "Service Provider is required" });
    }

    let awbNumber = req.body.awbNumber?.trim();
    if (!awbNumber) {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      awbNumber = `AWB-SG-${today}-${randomSuffix}`;
    }

    const numericQty = parseFloat(String(qty)) || 0;
    const numericRate = parseFloat(String(rate)) || 0;
    let finalTotal = parseFloat(String(totalAmount)) || 0;
    if (courierType === "Normal") {
      finalTotal = Math.round(numericQty * numericRate * 100) / 100;
    } else {
      finalTotal = Math.round((parseFloat(String(totalAmount)) || (numericQty * numericRate)) * 100) / 100;
    }

    const shipment = await CourierShipmentModel.create({
      awbNumber,
      customerCode: customerCode?.trim() || "",
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || "",
      customerPhone2: customerPhone2?.trim() || "",
      destinationAddress: destinationAddress?.trim() || "",
      destinationCity: destinationCity?.trim() || "",
      destinationState: destinationState?.trim() || "",
      destinationPincode: destinationPincode?.trim() || "",
      serviceProvider: serviceProvider.trim(),
      courierType: courierType === "VPP" ? "VPP" : "Normal",
      qty: numericQty,
      rate: numericRate,
      totalAmount: finalTotal,
      billNo: billNo?.trim() || "",
      paymentStatus: paymentStatus === "Paid" ? "Paid" : "Unpaid",
      insurance: parseFloat(String(insurance)) || 0,
      grossWeight: Number(grossWeight) || 0,
      boxWeight: Number(boxWeight) || 0,
      fromSender: fromSender?.trim() || "S G SURAT 9601511329 - 7405415105",
      packageType: packageType?.trim() || "Jewellery Box",
      weightKg: Number(grossWeight) || 0,
      boxCount: numericQty || 1,
      declaredValue: Number(insurance) || 0,
      referenceNo: billNo?.trim() || "",
      shippingMode: shippingMode?.trim() || "Armoured Secured",
      estimatedCost: finalTotal,
      status: status || "Booked",
      specialInstructions: specialInstructions?.trim() || "",
      bookedBy: bookedBy?.trim() || "Admin",
      dispatchDate: new Date(),
    });

    logActivity(req as any, {
      module: "Create Courier",
      section: "Shipment Register",
      action: "Add",
      details: `Booked courier shipment ${shipment.awbNumber} for ${shipment.customerName} (Bill #${shipment.billNo || "N/A"})`,
    });
    res.status(201).json({ success: true, data: shipment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to book courier shipment" });
  }
});

courierRouter.put("/shipments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const updateData: any = {};

    if (body.customerName !== undefined) updateData.customerName = body.customerName.trim();
    if (body.destinationCity !== undefined) updateData.destinationCity = body.destinationCity.trim();
    if (body.customerPhone !== undefined) updateData.customerPhone = body.customerPhone.trim();
    if (body.customerPhone2 !== undefined) updateData.customerPhone2 = body.customerPhone2.trim();
    if (body.destinationAddress !== undefined) updateData.destinationAddress = body.destinationAddress.trim();
    if (body.destinationState !== undefined) updateData.destinationState = body.destinationState.trim();
    if (body.destinationPincode !== undefined) updateData.destinationPincode = body.destinationPincode.trim();
    if (body.serviceProvider !== undefined) updateData.serviceProvider = body.serviceProvider.trim();
    if (body.courierType !== undefined) updateData.courierType = body.courierType === "VPP" ? "VPP" : "Normal";
    if (body.qty !== undefined) updateData.qty = parseFloat(String(body.qty)) || 0;
    if (body.rate !== undefined) updateData.rate = parseFloat(String(body.rate)) || 0;

    const qVal = body.qty !== undefined ? parseFloat(String(body.qty)) || 0 : undefined;
    const rVal = body.rate !== undefined ? parseFloat(String(body.rate)) || 0 : undefined;
    if (qVal !== undefined && rVal !== undefined) {
      updateData.totalAmount = Math.round(qVal * rVal * 100) / 100;
    } else if (body.totalAmount !== undefined) {
      updateData.totalAmount = Math.round((parseFloat(String(body.totalAmount)) || 0) * 100) / 100;
    }

    if (body.billNo !== undefined) updateData.billNo = body.billNo.trim();
    if (body.paymentStatus !== undefined) updateData.paymentStatus = body.paymentStatus === "Paid" ? "Paid" : "Unpaid";
    if (body.insurance !== undefined) updateData.insurance = parseFloat(String(body.insurance)) || 0;
    if (body.grossWeight !== undefined) updateData.grossWeight = Number(body.grossWeight) || 0;
    if (body.boxWeight !== undefined) updateData.boxWeight = Number(body.boxWeight) || 0;
    if (body.fromSender !== undefined) updateData.fromSender = body.fromSender.trim();
    if (body.status !== undefined) updateData.status = body.status;
    if (body.specialInstructions !== undefined) updateData.specialInstructions = body.specialInstructions.trim();

    const shipment = await CourierShipmentModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!shipment) {
      return res.status(404).json({ success: false, error: "Shipment not found" });
    }

    logActivity(req as any, {
      module: "Create Courier",
      section: "Shipment Register",
      action: "Update",
      details: `Updated shipment ${shipment.awbNumber} (Bill #${shipment.billNo || "N/A"})`,
    });
    res.json({ success: true, data: shipment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to update shipment" });
  }
});

courierRouter.delete("/shipments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shipment = await CourierShipmentModel.findByIdAndDelete(id);
    if (!shipment) {
      return res.status(404).json({ success: false, error: "Shipment not found" });
    }
    logActivity(req as any, {
      module: "Create Courier",
      section: "Shipment Register",
      action: "Delete",
      details: `Deleted shipment ${shipment.awbNumber}`,
    });
    res.json({ success: true, message: "Shipment deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to delete shipment" });
  }
});

// ── OVERALL COURIER STATS ──────────────────────────────────────────────────
courierRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [totalCustomers, totalProviders, totalRateSlabs, totalShipments, inTransitShipments, deliveredShipments] =
      await Promise.all([
        CourierCustomerModel.countDocuments(),
        CourierServiceProviderModel.countDocuments({ status: "Active" }),
        CourierRateMasterModel.countDocuments({ status: "Active" }),
        CourierShipmentModel.countDocuments(),
        CourierShipmentModel.countDocuments({ status: "In Transit" }),
        CourierShipmentModel.countDocuments({ status: "Delivered" }),
      ]);

    res.json({
      success: true,
      stats: {
        totalCustomers,
        totalProviders,
        totalRateSlabs,
        totalShipments,
        inTransitShipments,
        deliveredShipments,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to fetch courier stats" });
  }
});
