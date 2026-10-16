import { useEffect, useState, useMemo } from "react";
import {
  PackagePlus,
  Search,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Printer,
  Copy,
  Download,
  Truck,
  Calendar,
  Clock,
  IndianRupee,
  MapPin,
  Phone,
  Layers,
  Trash2,
  Edit3,
  AlertTriangle,
  FileText,
  User,
  Scale,
  Shield,
  CreditCard,
  Plus,
  ArrowLeft,
  Package,
} from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import { Pagination } from "@/components/ui/Pagination";
import type { PermissionActions } from "@shared/api";
import type { CourierCustomer } from "./CustomerTabView";
import type { CourierServiceProvider } from "./ServiceProviderView";

export interface CourierShipment {
  _id: string;
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
  courierType: "Normal" | "VPP";
  qty: number | string;
  rate: number | string;
  totalAmount: number;
  billNo: string;
  paymentStatus: "Paid" | "Unpaid";
  insurance: number | string;
  grossWeight: number;
  boxWeight: number;
  fromSender: string;
  packageType?: string;
  weightKg?: number;
  boxCount?: number;
  declaredValue?: number;
  referenceNo?: string;
  shippingMode?: string;
  estimatedCost?: number;
  status:
    | "Booked"
    | "In Transit"
    | "Out for Delivery"
    | "Delivered"
    | "Returned";
  specialInstructions?: string;
  bookedBy?: string;
  dispatchDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Helper to determine if a shipment calculated amount (Total Amount - Insurance) is >= ₹100,000 (1 Lakh).
 * - If (Total Amount - Insurance) >= ₹100,000:
 *     Triangle badge displays: Insurance amount (default 10000)
 *     Center displays: Round oval circle with first 3 digits of (Total Amount - Insurance)
 * - If (Total Amount - Insurance) < ₹100,000:
 *     Triangle badge displays: (Total Amount - Insurance) in place of Insurance amount
 *     Center displays: NO oval circle
 */
const isShipmentOver1Lakh = (
  totalVal?: number | string,
  insVal?: number | string,
): boolean => {
  const total = parseFloat(String(totalVal)) || 0;
  const ins = parseFloat(String(insVal)) || 0;
  if (!total) return false;
  const diff = total - ins;
  return diff >= 100000;
};

/**
 * Returns what to display inside the triangle under "Insurance".
 * - If (Total Amount - Insurance) >= 100,000: returns the Insurance amount (default 10000).
 * - If (Total Amount - Insurance) < 100,000: returns (Total Amount - Insurance) (e.g. 15,000 - 10,000 = 5,000).
 */
const getTriangleBadgeAmount = (
  totalVal?: number | string,
  insVal?: number | string,
): string => {
  const total = parseFloat(String(totalVal)) || 0;
  const ins = parseFloat(String(insVal)) || 0;

  // If nothing entered yet, show default insurance placeholder
  if (!total) {
    return String(ins || 10000);
  }

  const diff = total - ins;
  if (diff >= 100000) {
    return String(ins || 10000);
  }

  const netAmount = Math.max(0, Math.round(diff * 100) / 100);
  return netAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

/**
 * Calculates Total Amount (or Rate) (₹) - Insurance (₹) and returns the rounded figure.
 * Manages round figure: e.g. 111 to 119 -> 120, 289 -> 290 (round up to next 10).
 * If amount/rate is not entered or 0, returns "----" matching the reference design.
 */
const getRateInsuranceCode = (
  rateVal?: number | string,
  insVal?: number | string,
): string => {
  const r = parseFloat(String(rateVal)) || 0;
  const ins = parseFloat(String(insVal)) || 0;
  if (!r) return "----";
  const diff = r - ins;
  if (diff <= 0) return "000";

  // Extract raw 3-digit figure
  const digits = Math.round(diff).toString().replace(/\D/g, "");
  const baseStr =
    digits.length >= 3 ? digits.slice(0, 3) : digits.padEnd(3, "0");
  const baseNum = parseInt(baseStr, 10) || 0;

  // Manage round figure: 111 to 119 -> 120, 289 -> 290 (round up to next 10)
  const rounded = Math.ceil(baseNum / 10) * 10;
  return rounded.toString();
};

/**
 * Extracts all unique recipient phone numbers.
 * If user has 2 numbers (phone1 & phone2, or slash/comma separated), returns both.
 */
const getShipmentPhones = (
  phone1?: string,
  phone2?: string,
  customerName?: string,
  customerCode?: string,
  allCustomers: CourierCustomer[] = [],
): string[] => {
  const result: string[] = [];

  const addCleanPhone = (val?: string) => {
    if (!val) return;
    const parts = String(val)
      .split(/[/,\n]+/)
      .map((s) => s.trim().replace(/\.+$/, ""))
      .filter(Boolean);
    parts.forEach((p) => {
      if (p && !result.includes(p)) {
        result.push(p);
      }
    });
  };

  addCleanPhone(phone1);
  addCleanPhone(phone2);

  // If fewer than 2 phones found, check if customer master has phone1 and phone2
  if (result.length < 2 && allCustomers.length > 0) {
    const matched = allCustomers.find(
      (c) =>
        (customerCode &&
          (c.gstNo === customerCode || c.name === customerCode)) ||
        (customerName &&
          c.name?.trim().toLowerCase() === customerName.trim().toLowerCase()),
    );
    if (matched) {
      addCleanPhone(matched.phone1);
      addCleanPhone(matched.phone2);
    }
  }

  return result.length > 0 ? result : [];
};

interface CreateCourierViewProps {
  permissions?: PermissionActions;
}

export function CreateCourierView({ permissions }: CreateCourierViewProps) {
  const canAdd = permissions?.add ?? true;
  const canUpdate = permissions?.update ?? true;
  const canDelete = permissions?.delete ?? true;
  const canExport = permissions?.export ?? true;

  // View mode: 'list' (default, show register first) | 'create' (form)
  const [viewMode, setViewMode] = useState<"list" | "create">("list");
  // Register tab filter: 'All' | 'Normal' | 'VPP'
  const [courierTab, setCourierTab] = useState<"All" | "Normal" | "VPP">("All");
  const [paymentFilter, setPaymentFilter] = useState("All");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [shipments, setShipments] = useState<CourierShipment[]>([]);
  const [customers, setCustomers] = useState<CourierCustomer[]>([]);
  const [providers, setProviders] = useState<CourierServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Form State ────────────────────────────────────────────────────────────
  const [awbNumber, setAwbNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPhone2, setCustomerPhone2] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationState, setDestinationState] = useState("");
  const [destinationPincode, setDestinationPincode] = useState("");
  const [serviceProvider, setServiceProvider] = useState("");

  // New Required Fields
  const [courierType, setCourierType] = useState<"Normal" | "VPP">("Normal");
  const [qty, setQty] = useState<string | number>("1");
  const [rate, setRate] = useState<string | number>(0);
  const [masterGoldRate, setMasterGoldRate] = useState<number>(0);
  const [vppAmount, setVppAmount] = useState<number>(0);
  const [billNo, setBillNo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Unpaid">(
    "Unpaid",
  );
  const [insurance, setInsurance] = useState<string | number>(10000);
  const [defaultSenderMaster, setDefaultSenderMaster] = useState(
    "From :- S G SURAT 9601511329 - 7405415105",
  );
  const [fromSender, setFromSender] = useState(
    "From :- S G SURAT 9601511329 - 7405415105",
  );

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Search & Filter in Register
  const [searchQuery, setSearchQuery] = useState("");

  // Print Slip Modal (Image 2) & Multi-Select Print
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [slipToPrint, setSlipToPrint] = useState<CourierShipment | null>(null);
  const [slipsToPrint, setSlipsToPrint] = useState<CourierShipment[]>([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] =
    useState<CourierShipment | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] =
    useState<CourierShipment | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const generateNewAwb = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setAwbNumber(`AWB-SG-${today}-${randomSuffix}`);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [shipRes, custRes, provRes, rateRes, senderRes] = await Promise.all(
        [
          authFetch("/api/courier/shipments"),
          authFetch("/api/courier/customers"),
          authFetch("/api/courier/service-providers"),
          authFetch("/api/courier/rate-masters"),
          authFetch("/api/courier/settings/from-sender"),
        ],
      );

      if (shipRes.ok) {
        const j = await shipRes.json();
        if (j.success && Array.isArray(j.data)) setShipments(j.data);
      }
      if (custRes.ok) {
        const j = await custRes.json();
        if (j.success && Array.isArray(j.data)) setCustomers(j.data);
      }
      if (provRes.ok) {
        const j = await provRes.json();
        if (j.success && Array.isArray(j.data)) {
          setProviders(j.data);
          if (j.data.length > 0 && !serviceProvider) {
            setServiceProvider(j.data[0].name);
          }
        }
      }
      if (rateRes.ok) {
        const j = await rateRes.json();
        if (j.success && Array.isArray(j.data) && j.data.length > 0) {
          const goldRate =
            Number(
              j.data[0].rate !== undefined
                ? j.data[0].rate
                : j.data[0].baseRate,
            ) || 0;
          setMasterGoldRate(goldRate);
          setRate((prev) => (prev === 0 ? goldRate : prev));
        }
      }
      if (senderRes.ok) {
        const j = await senderRes.json();
        if (j.success && j.data?.value) {
          setDefaultSenderMaster(j.data.value);
          setFromSender(j.data.value);
        }
      }
    } catch (err) {
      console.error("Failed to load courier data:", err);
      showToast("Error loading consignment records", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateNewAwb();
    loadData();
  }, []);

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = customers.find((c) => c._id === customerId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.phone1 || "");
      setCustomerPhone2(cust.phone2 || "");
      setDestinationAddress(cust.address || "");
      setDestinationCity(cust.city || "");
      setDestinationState(cust.state || "");
      setDestinationPincode(cust.pincode || "");
    }
  };

  // Calculated total amount (Fine × Rate / Amount per) with precision
  const numericQty = parseFloat(String(qty)) || 0;
  const numericRate = parseFloat(String(rate)) || 0;
  const computedTotal = Math.round(numericQty * numericRate * 100) / 100;

  // In VPP, the parcel gold valuation (Total Amount) for Insurance & Token Calculation
  // is calculated using: Fine × Fix Rate from Rate Master (e.g. Fine × masterGoldRate = 133,332)
  const vppRateMasterAmount =
    masterGoldRate > 0
      ? Math.round(numericQty * masterGoldRate * 100) / 100
      : computedTotal;

  // The effective total amount used in the Insurance & Token calculation:
  // For VPP: Fine × Rate Master Gold Rate (e.g. ₹133,332 − ₹10,000 = ₹123,332)
  // For Normal: Fine × Rate
  const effectiveCalculationTotal =
    courierType === "VPP" ? vppRateMasterAmount : computedTotal;

  // Valuation for slip & table calculations:
  // For VPP, always use Fine × Fix Rate from Rate Master (masterGoldRate)
  // For Normal, use totalAmount or Fine × Rate
  const getShipmentValuation = (s: CourierShipment) => {
    const q = parseFloat(String(s.qty)) || 1;
    const r = parseFloat(String(s.rate)) || 0;
    if (s.courierType === "VPP" && masterGoldRate > 0) {
      return Math.round(q * masterGoldRate * 100) / 100;
    }
    return s.totalAmount || q * r || r;
  };

  // Submit Create Shipment
  const handleBookCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setFormError("Please enter or select recipient customer name.");
      return;
    }
    if (!destinationCity.trim()) {
      setFormError("Destination city is required.");
      return;
    }
    if (!serviceProvider.trim()) {
      setFormError("Please select a service provider.");
      return;
    }
    if (!billNo.trim()) {
      setFormError("Please enter Bill Number.");
      return;
    }

    setFormSubmitting(true);
    setFormError("");

    const payload = {
      awbNumber: awbNumber || undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerPhone2: customerPhone2.trim(),
      destinationAddress: destinationAddress.trim(),
      destinationCity: destinationCity.trim(),
      destinationState: destinationState.trim(),
      destinationPincode: destinationPincode.trim(),
      serviceProvider: serviceProvider.trim(),
      courierType,
      qty: parseFloat(String(qty)) || 1,
      rate: parseFloat(String(rate)) || 0,
      totalAmount: effectiveCalculationTotal,
      billNo: billNo.trim(),
      paymentStatus: courierType === "VPP" ? "Unpaid" : paymentStatus,
      insurance: parseFloat(String(insurance)) || 0,
      grossWeight: 0,
      boxWeight: 0,
      fromSender: fromSender.trim() || defaultSenderMaster,
      status: "Booked",
    };

    try {
      const res = await authFetch("/api/courier/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Consignment ${data.data.awbNumber} booked successfully!`);
        setSlipToPrint(data.data);
        setSlipsToPrint([data.data]);
        setPrintModalOpen(true);
        // Reset form
        generateNewAwb();
        setBillNo("");
        setQty("1");
        setRate(0);
        setVppAmount(0);
        setSelectedCustomerId("");
        setCustomerName("");
        setCustomerPhone("");
        setCustomerPhone2("");
        setDestinationAddress("");
        setDestinationCity("");
        setDestinationPincode("");
        setFromSender(defaultSenderMaster);
        loadData();
        if (courierTab !== "All") {
          setCourierTab(data.data.courierType || courierType);
        }
        setViewMode("list");
      } else {
        setFormError(data.error || "Failed to book courier consignment.");
      }
    } catch (err: any) {
      setFormError(err.message || "Network error occurred.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (shipment: CourierShipment) => {
    setEditingShipment({ ...shipment });
    setEditError("");
    setEditModalOpen(true);
  };

  // Submit Edit Shipment
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShipment) return;
    if (!editingShipment.customerName?.trim()) {
      setEditError("Recipient name is required");
      return;
    }
    if (!editingShipment.destinationCity?.trim()) {
      setEditError("Destination city is required");
      return;
    }
    if (!editingShipment.billNo?.trim()) {
      setEditError("Bill Number is required");
      return;
    }

    setEditSubmitting(true);
    setEditError("");

    const numericQ = parseFloat(String(editingShipment.qty)) || 0;
    const numericR = parseFloat(String(editingShipment.rate)) || 0;
    const total =
      editingShipment.courierType === "VPP" && masterGoldRate > 0
        ? Math.round(numericQ * masterGoldRate * 100) / 100
        : Math.round(numericQ * numericR * 100) / 100;

    try {
      const res = await authFetch(
        `/api/courier/shipments/${editingShipment._id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editingShipment,
            qty: numericQ,
            rate: numericR,
            totalAmount: total,
            insurance: parseFloat(String(editingShipment.insurance)) || 0,
          }),
        },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Consignment updated successfully");
        setEditModalOpen(false);
        setEditingShipment(null);
        loadData();
      } else {
        setEditError(data.error || "Failed to update consignment");
      }
    } catch (err: any) {
      setEditError(err.message || "Failed to update consignment");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Delete Modal
  const handleOpenDelete = (shipment: CourierShipment) => {
    setShipmentToDelete(shipment);
    setDeleteModalOpen(true);
  };

  // Confirm Delete Shipment
  const handleConfirmDelete = async () => {
    if (!shipmentToDelete) return;
    setDeleteSubmitting(true);
    try {
      const res = await authFetch(
        `/api/courier/shipments/${shipmentToDelete._id}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(
          `Consignment ${shipmentToDelete.awbNumber} deleted successfully`,
        );
        setDeleteModalOpen(false);
        setShipmentToDelete(null);
        setSelectedShipmentIds((prev) =>
          prev.filter((id) => id !== shipmentToDelete._id)
        );
        loadData();
      } else {
        showToast(data.error || "Failed to delete consignment", "error");
      }
    } catch {
      showToast("Failed to delete consignment", "error");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Split shipments into Normal and VPP
  const normalShipments = useMemo(() => {
    return shipments.filter((s) => (s.courierType || "Normal") === "Normal");
  }, [shipments]);

  const vppShipments = useMemo(() => {
    return shipments.filter((s) => s.courierType === "VPP");
  }, [shipments]);

  const activeTabShipments = useMemo(() => {
    if (courierTab === "Normal") return normalShipments;
    if (courierTab === "VPP") return vppShipments;
    return shipments;
  }, [courierTab, normalShipments, vppShipments, shipments]);

  // Filtered Register Shipments for active tab
  const filteredShipments = useMemo(() => {
    return activeTabShipments.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.awbNumber.toLowerCase().includes(q) ||
        s.billNo?.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.destinationCity.toLowerCase().includes(q) ||
        s.serviceProvider.toLowerCase().includes(q) ||
        (s.courierType || "Normal").toLowerCase().includes(q) ||
        s.customerPhone?.toLowerCase().includes(q);

      const matchesPayment =
        paymentFilter === "All" ||
        (s.courierType !== "VPP" && s.paymentStatus === paymentFilter);
      return matchesSearch && matchesPayment;
    });
  }, [activeTabShipments, searchQuery, paymentFilter]);

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, paymentFilter, courierTab]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredShipments.length / pageSize),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedShipments = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredShipments.slice(start, start + pageSize);
  }, [filteredShipments, safeCurrentPage, pageSize]);

  const allMetrics = useMemo(() => {
    const total = shipments.length;
    const paid = shipments.filter(
      (s) => s.courierType !== "VPP" && s.paymentStatus === "Paid",
    ).length;
    const unpaid = shipments.filter(
      (s) => s.courierType !== "VPP" && s.paymentStatus === "Unpaid",
    ).length;
    const amount = shipments.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    return { total, paid, unpaid, amount };
  }, [shipments]);

  const normalMetrics = useMemo(() => {
    const total = normalShipments.length;
    const paid = normalShipments.filter(
      (s) => s.paymentStatus === "Paid",
    ).length;
    const unpaid = normalShipments.filter(
      (s) => s.paymentStatus === "Unpaid",
    ).length;
    const amount = normalShipments.reduce(
      (sum, s) => sum + (s.totalAmount || 0),
      0,
    );
    return { total, paid, unpaid, amount };
  }, [normalShipments]);

  const vppMetrics = useMemo(() => {
    const total = vppShipments.length;
    const paid = vppShipments.filter((s) => s.paymentStatus === "Paid").length;
    const unpaid = vppShipments.filter(
      (s) => s.paymentStatus === "Unpaid",
    ).length;
    const amount = vppShipments.reduce(
      (sum, s) => sum + (s.totalAmount || 0),
      0,
    );
    return { total, paid, unpaid, amount };
  }, [vppShipments]);

  const openCreateForm = (type?: "Normal" | "VPP") => {
    const targetType = type || (courierTab === "VPP" ? "VPP" : "Normal");
    setCourierType(targetType);
    setQty(1);
    if (targetType === "VPP") {
      setPaymentStatus("Unpaid");
      setRate(0); // Not fixed like normal, user enters freely
    } else {
      if (masterGoldRate > 0) {
        setRate(masterGoldRate);
      }
    }
    // Auto-fetch latest sender setting from master
    authFetch("/api/courier/settings/from-sender")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.value) {
          setDefaultSenderMaster(j.data.value);
          setFromSender(j.data.value);
        }
      })
      .catch(() => {});

    generateNewAwb();
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setViewMode("create");
  };

  const handleSaveAsDefaultSender = async () => {
    const clean = fromSender.trim();
    if (!clean) {
      showToast("Sender line cannot be empty", "error");
      return;
    }
    try {
      const res = await authFetch("/api/courier/settings/from-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: clean }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDefaultSenderMaster(json.data.value);
        setFromSender(json.data.value);
        showToast("Saved as new Master Default Sender Line!");
      } else {
        showToast(json.error || "Failed to update default sender", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Could not save default sender", "error");
    }
  };

  // Multi-selection handlers
  const handleToggleSelectOne = (id: string) => {
    setSelectedShipmentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectPage = () => {
    const pageIds = pagedShipments.map((s) => s._id);
    const allPageSelected =
      pageIds.length > 0 &&
      pageIds.every((id) => selectedShipmentIds.includes(id));
    if (allPageSelected) {
      setSelectedShipmentIds((prev) =>
        prev.filter((id) => !pageIds.includes(id))
      );
    } else {
      setSelectedShipmentIds((prev) =>
        Array.from(new Set([...prev, ...pageIds]))
      );
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedShipmentIds(filteredShipments.map((s) => s._id));
  };

  const handleClearSelection = () => {
    setSelectedShipmentIds([]);
  };

  const handlePrintSelected = () => {
    const selected = shipments.filter((s) =>
      selectedShipmentIds.includes(s._id)
    );
    if (selected.length === 0) {
      showToast("Please select at least one consignment to print", "error");
      return;
    }
    setSlipsToPrint(selected);
    setSlipToPrint(selected[0]);
    setPrintModalOpen(true);
  };

  // Trigger Print Slip for a single shipment
  const handlePrintSlip = (shipment: CourierShipment) => {
    setSlipToPrint(shipment);
    setSlipsToPrint([shipment]);
    setPrintModalOpen(true);
  };

  const escapeHtml = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Dedicated thermal print via isolated iframe (eliminates modal fixed/overflow clipping and multi-page overlaps)
  const printConsignmentSlips = (slips: CourierShipment[]) => {
    if (!slips.length) return;

    // Remove any leftover thermal print iframe
    const existingIframe = document.getElementById("thermal-print-iframe");
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement("iframe");
    iframe.id = "thermal-print-iframe";
    iframe.setAttribute(
      "style",
      "position:fixed;top:-10000px;left:-10000px;width:75mm;height:50mm;border:0;visibility:hidden;",
    );
    document.body.appendChild(iframe);

    const slipsHtml = slips
      .map((slip) => {
        const isVPP = slip.courierType === "VPP";
        const paymentHeader = isVPP
          ? "VPP"
          : `IS:- ${(slip.paymentStatus || "UNPAID").toUpperCase()}`;
        const providerHeader = `SERVICE PROVIDER :- ${slip.serviceProvider || "JAY AMBE LOGISTIC"}`;
        const valuation = getShipmentValuation(slip);
        const isOver1Lakh = isShipmentOver1Lakh(valuation, slip.insurance);
        const triangleAmount = getTriangleBadgeAmount(valuation, slip.insurance);
        const tokenCode = getRateInsuranceCode(valuation, slip.insurance);
        const phones = getShipmentPhones(
          slip.customerPhone,
          slip.customerPhone2,
          slip.customerName,
          slip.customerCode,
          customers,
        );
        const senderLine =
          slip.fromSender || "From :- S G SURAT 9601511329 - 7405415105";

        const triFontSize =
          triangleAmount.length > 7
            ? "10"
            : triangleAmount.length > 5
              ? "11.5"
              : "13";

        return `
          <div class="slip-page">
            <div class="slip-card">
              <!-- Top Row -->
              <div class="slip-top">
                <div class="slip-top-left">${escapeHtml(paymentHeader)}</div>
                <div class="slip-top-right">${escapeHtml(providerHeader)}</div>
              </div>

              <!-- Middle Row -->
              <div class="slip-mid">
                <!-- Left Column: Triangle in Top Corner + Oval Badge & VPP Fine/Amount shifted left & up -->
                <div class="slip-left-col">
                  <!-- Triangle SVG -->
                  <div class="slip-tri-wrap">
                    <svg viewBox="0 0 100 100" class="slip-tri-svg">
                      <line x1="0" y1="100" x2="100" y2="0" stroke="#000000" stroke-width="2.5" />
                      <g transform="rotate(-45, 50, 50)">
                        <text x="50" y="38" text-anchor="middle" fill="#000000" font-weight="900" font-size="11.5" letter-spacing="0.3" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Insurance</text>
                        <text x="50" y="64" text-anchor="middle" fill="#000000" font-weight="900" font-size="${triFontSize}" letter-spacing="0.2" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">${escapeHtml(triangleAmount)}</text>
                      </g>
                    </svg>
                  </div>

                  <!-- Oval Badge & VPP Fine/Amount moved left & up -->
                  <div class="slip-oval-block">
                    ${
                      isOver1Lakh
                        ? `<div class="slip-oval">${escapeHtml(tokenCode)}</div>`
                        : ""
                    }
                    ${
                      isVPP && (slip.qty || slip.rate)
                        ? `
                      <div class="slip-fine-amt">
                        <div class="slip-fine-line">FINE : ${escapeHtml(slip.qty || 1)}</div>
                        <div class="slip-amt-line">AMOUNT : ${escapeHtml(slip.rate || 0)}</div>
                      </div>
                    `
                        : ""
                    }
                  </div>
                </div>

                <!-- Right Side: Full Recipient Details (Expanded width, NO CUT, NO HIDE) -->
                <div class="slip-right">
                  <div class="slip-to-city">TO :- ${escapeHtml(slip.destinationCity || "DELHI")}</div>
                  <div class="slip-cust-name">${escapeHtml(slip.customerName || "RECIPIENT")}</div>
                  ${
                    slip.destinationAddress
                      ? `<div class="slip-addr">${escapeHtml(slip.destinationAddress)}</div>`
                      : ""
                  }
                  ${
                    slip.destinationPincode
                      ? `<div class="slip-pin">PIN - ${escapeHtml(slip.destinationPincode)}</div>`
                      : ""
                  }
                  <div class="slip-phones">
                    ${
                      phones.length > 0
                        ? phones
                            .map((p) => `<div>${escapeHtml(p)}.</div>`)
                            .join("")
                        : "<div>—</div>"
                    }
                  </div>
                </div>
              </div>

              <!-- Bottom Row -->
              <div class="slip-bottom">
                ${escapeHtml(senderLine)}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Consignment Labels (75mm x 50mm)</title>
  <style>
    @page {
      size: 75mm 50mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      margin: 0;
      padding: 0;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      width: 75mm !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }
    .slip-page {
      width: 75mm !important;
      height: 50mm !important;
      max-width: 75mm !important;
      max-height: 50mm !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      padding: 0.8mm !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      background: #ffffff !important;
    }
    .slip-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .slip-card {
      width: 73.4mm !important;
      height: 48.4mm !important;
      max-width: 73.4mm !important;
      max-height: 48.4mm !important;
      border: 1.5px solid #000000 !important;
      border-radius: 2px !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      overflow: hidden !important;
      background: #ffffff !important;
      color: #000000 !important;
      box-sizing: border-box !important;
    }
    .slip-top {
      height: 5.8mm !important;
      min-height: 5.8mm !important;
      max-height: 5.8mm !important;
      padding: 0.5mm 1.5mm !important;
      border-bottom: 1.2px solid #000000 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      font-size: 7.2pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
    .slip-top-left {
      text-transform: uppercase !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
    }
    .slip-top-right {
      text-transform: uppercase !important;
      text-align: right !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
    }
    .slip-mid {
      flex: 1 !important;
      height: 36.8mm !important;
      min-height: 36.8mm !important;
      max-height: 36.8mm !important;
      padding: 0.6mm 1.5mm !important;
      border-bottom: 1.2px solid #000000 !important;
      display: flex !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      position: relative !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }
    .slip-left-col {
      width: 26mm !important;
      min-width: 26mm !important;
      max-width: 26mm !important;
      flex-shrink: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      position: relative !important;
      padding-top: 9mm !important;
      box-sizing: border-box !important;
    }
    .slip-tri-wrap {
      position: absolute !important;
      top: -0.6mm !important;
      left: -1.5mm !important;
      width: 14mm !important;
      height: 14mm !important;
      pointer-events: none !important;
    }
    .slip-tri-svg {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
    }
    .slip-oval-block {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      margin-top: 0.5mm !important;
      margin-left: 3.5mm !important;
    }
    .slip-oval {
      border: 1.5px solid #000000 !important;
      border-radius: 50% !important;
      padding: 0.6mm 2.2mm !important;
      min-width: 14mm !important;
      text-align: center !important;
      font-size: 11.5pt !important;
      font-weight: 900 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      line-height: 1 !important;
      display: inline-block !important;
      -webkit-text-stroke: 0.3px #000000 !important;
    }
    .slip-fine-amt {
      font-size: 8pt !important;
      font-weight: 900 !important;
      line-height: 1.25 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace, system-ui, sans-serif !important;
      text-align: center !important;
      margin-top: 3mm !important;
      text-transform: uppercase !important;
      letter-spacing: 0.25px !important;
      white-space: nowrap !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 1.5mm !important;
      -webkit-text-stroke: 0.35px #000000 !important;
    }
    .slip-fine-amt .slip-amt-line {
      margin-top: 1.5mm !important;
    }
    /* Right Side: Recipient Details - Expanded Width, NO CUT, NO HIDE */
    .slip-right {
      flex: 1 !important;
      width: auto !important;
      padding-left: 3mm !important;
      padding-top: 2.5mm !important;
      padding-right: 0.5mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: flex-start !important;
      line-height: 1.15 !important;
      font-weight: 900 !important;
      text-transform: uppercase !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }
    .slip-to-city {
      font-size: 7.8pt !important;
      font-weight: 900 !important;
      letter-spacing: 0.2px !important;
      line-height: 1.15 !important;
      -webkit-text-stroke: 0.2px #000000 !important;
    }
    .slip-cust-name {
      font-size: 7.4pt !important;
      font-weight: 900 !important;
      margin-top: 0.3mm !important;
      word-break: break-word !important;
      line-height: 1.15 !important;
      -webkit-text-stroke: 0.2px #000000 !important;
    }
    .slip-addr {
      font-size: 6.2pt !important;
      font-weight: 900 !important;
      color: #000000 !important;
      line-height: 1.15 !important;
      margin-top: 0.3mm !important;
      word-break: break-word !important;
      white-space: normal !important;
      overflow: visible !important;
      display: block !important;
      -webkit-text-stroke: 0.15px #000000 !important;
    }
    .slip-pin {
      font-size: 6.8pt !important;
      font-weight: 900 !important;
      margin-top: 0.3mm !important;
      font-family: ui-monospace, monospace, sans-serif !important;
      line-height: 1.15 !important;
      -webkit-text-stroke: 0.2px #000000 !important;
    }
    .slip-phones {
      font-size: 6.8pt !important;
      font-weight: 900 !important;
      line-height: 1.15 !important;
      font-family: ui-monospace, monospace, sans-serif !important;
      margin-top: 0.3mm !important;
      -webkit-text-stroke: 0.2px #000000 !important;
    }
    .slip-bottom {
      height: 5.4mm !important;
      min-height: 5.4mm !important;
      max-height: 5.4mm !important;
      padding: 0.5mm 1.5mm !important;
      display: flex !important;
      align-items: center !important;
      font-size: 6pt !important;
      font-weight: 900 !important;
      line-height: 1 !important;
      text-transform: uppercase !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
  </style>
</head>
<body>
  ${slipsHtml}
</body>
</html>`);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print iframe failed, fallback to window.print:", err);
        window.print();
      }
      setTimeout(() => {
        iframe.remove();
      }, 3000);
    }, 300);
  };

  const executePrint = () => {
    const slips =
      slipsToPrint.length > 0 ? slipsToPrint : slipToPrint ? [slipToPrint] : [];
    if (!slips.length) return;
    printConsignmentSlips(slips);
  };

  // Export CSV
  const exportCSV = () => {
    if (!filteredShipments.length) {
      showToast("No data to export", "error");
      return;
    }

    const headers = [
      "AWB Number",
      "Date",
      "Type",
      "Bill No",
      "Customer Name",
      "Phone",
      "City",
      "Address",
      "Service Provider",
      "Payment Status",
      "Fine",
      "Rate",
      "Total Amount",
      "Insurance",
      "Rate - Ins Code / Triangle",
    ];

    const rows = filteredShipments.map((s) => [
      `"${s.awbNumber}"`,
      `"${new Date(s.dispatchDate || s.createdAt || Date.now()).toLocaleDateString()}"`,
      `"${s.courierType || "Normal"}"`,
      `"${s.billNo || ""}"`,
      `"${s.customerName}"`,
      `"${s.customerPhone || ""}"`,
      `"${s.destinationCity}"`,
      `"${(s.destinationAddress || "").replace(/"/g, '""')}"`,
      `"${s.serviceProvider}"`,
      `"${s.courierType === "VPP" ? "—" : s.paymentStatus || "Unpaid"}"`,
      s.qty || 1,
      s.rate || 0,
      s.totalAmount || 0,
      s.insurance || 0,
      isShipmentOver1Lakh(s.totalAmount || s.rate, s.insurance)
        ? `"${getRateInsuranceCode(s.totalAmount || s.rate, s.insurance)}"`
        : `"${getTriangleBadgeAmount(s.totalAmount || s.rate, s.insurance)}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Courier_${courierTab}_Register_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      `${courierTab === "All" ? "Consignment" : courierTab} register exported to CSV`,
    );
  };

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <Check size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Print Stylesheet for 75mm x 50mm Thermal Labels */}
      <style>{`
        @media print {
          @page {
            size: 75mm 50mm;
            margin: 0mm;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 75mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #print-area-wrapper, #print-area-wrapper * {
            visibility: visible !important;
          }
          #print-area-wrapper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 75mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            display: block !important;
            z-index: 999999 !important;
          }
          .print-preview-badge {
            display: none !important;
          }
          .print-slip-item {
            width: 75mm !important;
            height: 50mm !important;
            max-height: 50mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 0.8mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .print-slip-item:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .printable-courier-slip, #printable-courier-slip {
            width: 73.4mm !important;
            height: 48.4mm !important;
            max-width: 73.4mm !important;
            max-height: 48.4mm !important;
            border: 1.5px solid #000 !important;
            border-radius: 2px !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            box-sizing: border-box !important;
          }
          .printable-courier-slip *, #printable-courier-slip * {
            color: #000 !important;
          }
          /* Row 1: Top Bar */
          .slip-row-top {
            height: 6mm !important;
            min-height: 6mm !important;
            max-height: 6.2mm !important;
            padding: 0.5mm 1.5mm !important;
            border-bottom: 1.2px solid #000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            font-size: 7.2pt !important;
            font-weight: 900 !important;
            line-height: 1 !important;
            box-sizing: border-box !important;
            flex-shrink: 0 !important;
          }
          /* Row 2: Middle Area */
          .slip-row-middle {
            flex: 1 !important;
            height: 36.4mm !important;
            min-height: 36.6mm !important;
            max-height: 36.8mm !important;
            padding: 0.6mm 1.5mm !important;
            border-bottom: 1.2px solid #000 !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            position: relative !important;
            box-sizing: border-box !important;
          }
          .slip-left-col {
            width: 26mm !important;
            min-width: 26mm !important;
            max-width: 26mm !important;
            flex-shrink: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            position: relative !important;
            padding-top: 9mm !important;
            box-sizing: border-box !important;
          }
          .slip-triangle-svg {
            position: absolute !important;
            top: -0.6mm !important;
            left: -1.5mm !important;
            width: 14mm !important;
            height: 14mm !important;
            pointer-events: none !important;
          }
          .slip-oval-block {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            width: 100% !important;
            margin-top: 0.5mm !important;
            margin-left: 3.5mm !important;
          }
          .slip-oval-badge {
            border: 1.5px solid #000 !important;
            border-radius: 50% !important;
            padding: 0.6mm 2.2mm !important;
            min-width: 14mm !important;
            text-align: center !important;
            font-size: 11.5pt !important;
            font-weight: 900 !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            line-height: 1 !important;
            display: inline-block !important;
            -webkit-text-stroke: 0.3px #000 !important;
          }
          .slip-fine-rate-block {
            font-size: 8pt !important;
            font-weight: 900 !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace, system-ui, sans-serif !important;
            line-height: 1.25 !important;
            margin-top: 3mm !important;
            text-align: center !important;
            text-transform: uppercase !important;
            letter-spacing: 0.25px !important;
            white-space: nowrap !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 1.5mm !important;
            -webkit-text-stroke: 0.35px #000 !important;
          }
          .slip-fine-rate-block .slip-amt-line {
            margin-top: 1.5mm !important;
          }
          /* Right: Recipient Details - Expanded Width, NO CUT, NO HIDE */
          .slip-recipient-box {
            flex: 1 !important;
            width: auto !important;
            padding-left: 3mm !important;
            padding-top: 2.5mm !important;
            padding-right: 0.5mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;
            align-items: flex-start !important;
            line-height: 1.15 !important;
            font-weight: 900 !important;
            text-transform: uppercase !important;
            overflow: visible !important;
            box-sizing: border-box !important;
          }
          .slip-recipient-city {
            font-size: 7.8pt !important;
            font-weight: 900 !important;
            letter-spacing: 0.2px !important;
            line-height: 1.15 !important;
            -webkit-text-stroke: 0.2px #000 !important;
          }
          .slip-recipient-name {
            font-size: 7.4pt !important;
            font-weight: 900 !important;
            margin-top: 0.3mm !important;
            word-break: break-word !important;
            line-height: 1.15 !important;
            -webkit-text-stroke: 0.2px #000 !important;
          }
          .slip-recipient-addr {
            font-size: 6.2pt !important;
            font-weight: 900 !important;
            color: #000000 !important;
            line-height: 1.15 !important;
            margin-top: 0.3mm !important;
            word-break: break-word !important;
            white-space: normal !important;
            overflow: visible !important;
            display: block !important;
            -webkit-text-stroke: 0.15px #000 !important;
          }
          .slip-recipient-pin {
            font-size: 6.8pt !important;
            font-weight: 900 !important;
            margin-top: 0.3mm !important;
            font-family: ui-monospace, monospace, sans-serif !important;
            line-height: 1.15 !important;
            -webkit-text-stroke: 0.2px #000 !important;
          }
          .slip-recipient-phone {
            font-size: 6.8pt !important;
            font-weight: 900 !important;
            line-height: 1.15 !important;
            font-family: ui-monospace, monospace, sans-serif !important;
            margin-top: 0.3mm !important;
            -webkit-text-stroke: 0.2px #000 !important;
          }
          /* Row 3: Bottom Sender Line */
          .slip-row-sender {
            height: 5.6mm !important;
            min-height: 5.6mm !important;
            max-height: 5.8mm !important;
            padding: 0.5mm 1.5mm !important;
            border-top: none !important;
            border-bottom: none !important;
            font-size: 6pt !important;
            font-weight: 900 !important;
            text-transform: uppercase !important;
            line-height: 1 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            box-sizing: border-box !important;
            flex-shrink: 0 !important;
            display: flex !important;
            align-items: center !important;
          }
        }
      `}</style>

      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#18476A]/10 dark:bg-cyan-500/10 text-[#18476A] dark:text-cyan-400 font-bold shrink-0">
            {viewMode === "create" ? (
              <PackagePlus size={24} />
            ) : (
              <Truck size={24} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {viewMode === "create"
                  ? `Create ${courierType} Consignment`
                  : "Courier Dispatch Register"}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                  courierType === "VPP"
                    ? "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300"
                    : "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300"
                }`}
              >
                {viewMode === "create"
                  ? `${courierType} Form`
                  : "Dispatch Register"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {viewMode === "create"
                ? "Fill consignment particulars, recipient address and generate printable dispatch label."
                : "Monitor Normal and VPP courier dispatches, tracking statuses and consignment registers."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {viewMode === "create" ? (
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
            >
              <ArrowLeft size={15} />
              <span>Back to Register</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
                title="Refresh consignments"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              {canExport && (
                <button
                  type="button"
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              )}

              {canAdd && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCreateForm("Normal")}
                    className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs font-bold rounded-xl text-white bg-[#18476A] hover:bg-[#123955] transition shadow-xs cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Create Normal Courier</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openCreateForm("VPP")}
                    className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs font-bold rounded-xl text-white bg-purple-600 hover:bg-purple-700 transition shadow-xs cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Create VPP Courier</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CREATE FORM VIEW */}
      {viewMode === "create" && (
        <form onSubmit={handleBookCourier} className="space-y-6">
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Main Fields */}
            <div className="lg:col-span-2 space-y-6">
              {/* Waybill / Header Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#18476A]/10 text-[#18476A] dark:bg-cyan-500/10 dark:text-cyan-400">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Waybill / Consignment Number
                      </div>
                      <div className="text-base sm:text-lg font-black tracking-wide text-slate-900 dark:text-white font-mono">
                        {awbNumber}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateNewAwb}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer self-start sm:self-auto"
                  >
                    <RefreshCw size={12} />
                    <span>Regenerate AWB</span>
                  </button>
                </div>

                {/* For Normal Courier: Payment Status (Unpaid / Paid) */}
                {courierType === "Normal" && (
                  <div className="pt-1">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 max-w-sm">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                        Payment Status (Is:-) *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label
                          className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                            paymentStatus === "Unpaid"
                              ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentStatus"
                            value="Unpaid"
                            checked={paymentStatus === "Unpaid"}
                            onChange={() => setPaymentStatus("Unpaid")}
                            className="sr-only"
                          />
                          <span className="w-2 h-2 rounded-full bg-current" />
                          <span>Unpaid</span>
                        </label>

                        <label
                          className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                            paymentStatus === "Paid"
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentStatus"
                            value="Paid"
                            checked={paymentStatus === "Paid"}
                            onChange={() => setPaymentStatus("Paid")}
                            className="sr-only"
                          />
                          <span className="w-2 h-2 rounded-full bg-current" />
                          <span>Paid</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recipient Details Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <User
                      size={16}
                      className="text-[#18476A] dark:text-cyan-400"
                    />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Recipient / Customer Details (TO :-)
                    </h3>
                  </div>
                </div>

                {/* Auto Fill Customer Dropdown */}
                {customers.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Select Customer from Customer Tab (Auto-fills Address &
                      Details)
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]/40"
                    >
                      <option value="">
                        -- Choose registered customer or enter below --
                      </option>
                      {customers.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} {c.city ? `(${c.city})` : ""}{" "}
                          {c.phone1 ? `• ${c.phone1}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Recipient / Firm Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. RAHUL BHAI DELHI"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Recipient Phone 1
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9873111955"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Recipient Phone 2
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9265700040"
                      value={customerPhone2}
                      onChange={(e) => setCustomerPhone2(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DELHI"
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Delhi"
                      value={destinationState}
                      onChange={(e) => setDestinationState(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pincode
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 110006"
                      value={destinationPincode}
                      onChange={(e) => setDestinationPincode(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Destination Address
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Complete physical destination address..."
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden resize-none"
                  />
                </div>
              </div>

              {/* Billing, Qty, Rate & Bill No Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <IndianRupee
                      size={16}
                      className="text-[#18476A] dark:text-cyan-400"
                    />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Billing & Consignment Calculations
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Service Provider */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Service Provider *
                    </label>
                    {providers.length > 0 ? (
                      <select
                        required
                        value={serviceProvider}
                        onChange={(e) => setServiceProvider(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                      >
                        <option value="">-- Choose Provider --</option>
                        {providers.map((p) => (
                          <option key={p._id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="e.g. JAY AMBE LOGISTIC"
                        value={serviceProvider}
                        onChange={(e) => setServiceProvider(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                      />
                    )}
                  </div>

                  {/* Bill No */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Bill No *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 5490"
                      value={billNo}
                      onChange={(e) => setBillNo(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Normal: Fine, Rate, Total Amount calculation */}
                {courierType === "Normal" ? (
                  <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-slate-800/80 border border-blue-200/60 dark:border-slate-700 space-y-3">
                    <div className="text-xs font-bold text-[#18476A] dark:text-cyan-400 uppercase tracking-wider">
                      Normal Courier: Enter Fine & Rate
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Fine *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          required
                          placeholder="e.g. 10.500"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            Rate (₹) *
                          </label>
                          {masterGoldRate > 0 && (
                            <button
                              type="button"
                              onClick={() => setRate(masterGoldRate)}
                              className="text-[10px] font-bold text-[#18476A] dark:text-cyan-400 bg-[#18476A]/10 dark:bg-cyan-500/10 hover:bg-[#18476A]/20 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="Click to reset to Rate Master gold rate"
                            >
                              Rate Master: ₹{masterGoldRate.toLocaleString()}
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          required
                          placeholder={
                            masterGoldRate
                              ? `e.g. ${masterGoldRate}`
                              : "e.g. 5000"
                          }
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Total Amount (Fine × Rate)
                        </label>
                        <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono flex items-center justify-between">
                          <span>₹{computedTotal.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({qty} × ₹{numericRate.toLocaleString()})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VPP Courier: Fine & Rate (Total Amount Fine × Rate removed for VPP) */
                  <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-slate-800/80 border border-purple-200/60 dark:border-slate-700 space-y-3">
                    <div className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                      VPP Courier: Enter Fine & Rate
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Fine *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          required
                          placeholder="e.g. 10.500"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/30 focus:outline-hidden font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            Amount / Rate (₹) *
                          </label>
                          {masterGoldRate > 0 && (
                            <button
                              type="button"
                              onClick={() => setRate(masterGoldRate)}
                              className="text-[10px] font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="Click to use Rate Master gold rate"
                            >
                              Rate Master: ₹{masterGoldRate.toLocaleString()}
                            </button>
                          )}
                        </div>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          required
                          placeholder="e.g. 13000"
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500/30 focus:outline-hidden font-mono"
                        />
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5 block">
                          Enter custom rate / collection amount
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Insurance & Calculation Token Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Shield
                      size={16}
                      className="text-[#18476A] dark:text-cyan-400"
                    />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Insurance & Token Calculation
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Insurance (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={insurance}
                      onChange={(e) => setInsurance(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Shows as angled Insurance badge in slip
                    </span>
                  </div>

                  {/* Calculated Round Oval: Total Amount - Insurance (₹) (First 3 digits) or In-Triangle Display */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {isShipmentOver1Lakh(
                          effectiveCalculationTotal,
                          insurance,
                        )
                          ? "Total Amount − Insurance (₹)"
                          : "Amount in Triangle (Net < ₹1,00,000)"}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        {isShipmentOver1Lakh(
                          effectiveCalculationTotal,
                          insurance,
                        ) ? (
                          <span>
                            ₹{effectiveCalculationTotal.toLocaleString()} − ₹
                            {(
                              parseFloat(String(insurance)) || 0
                            ).toLocaleString()}{" "}
                            = ₹
                            {(
                              effectiveCalculationTotal -
                              (parseFloat(String(insurance)) || 0)
                            ).toLocaleString()}
                          </span>
                        ) : effectiveCalculationTotal > 0 ? (
                          <span>
                            ₹{effectiveCalculationTotal.toLocaleString()} − ₹
                            {(
                              parseFloat(String(insurance)) || 0
                            ).toLocaleString()}{" "}
                            = ₹
                            {getTriangleBadgeAmount(
                              effectiveCalculationTotal,
                              insurance,
                            )}{" "}
                            in corner triangle (No circle)
                          </span>
                        ) : (
                          <span>Auto-calculated token code</span>
                        )}
                        {courierType === "VPP" && masterGoldRate > 0 && (
                          <div className="text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-1">
                            Rate Master Gold Rate: {qty || 1} (Fine) × ₹
                            {masterGoldRate.toLocaleString()} = ₹
                            {effectiveCalculationTotal.toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                        {isShipmentOver1Lakh(
                          effectiveCalculationTotal,
                          insurance,
                        )
                          ? "First 3 Digits in Circle (Net ≥ ₹1,00,000)"
                          : "Net amount shows in triangle; circle hidden for Net < ₹1,00,000"}
                      </div>
                    </div>

                    {/* Round Oval Element ONLY when >= 100,000 */}
                    {isShipmentOver1Lakh(
                      effectiveCalculationTotal,
                      insurance,
                    ) ? (
                      <div className="border-2 border-black dark:border-white rounded-[50%/50%] px-5 py-2 min-w-[95px] text-center shadow-xs bg-white dark:bg-slate-900 shrink-0">
                        <span className="text-xl sm:text-2xl font-black font-mono tracking-widest text-slate-900 dark:text-white">
                          {getRateInsuranceCode(
                            effectiveCalculationTotal,
                            insurance,
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center shrink-0">
                        <div className="text-xs font-black font-mono text-slate-900 dark:text-white">
                          {getTriangleBadgeAmount(
                            effectiveCalculationTotal,
                            insurance,
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium">
                          In Triangle
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      From Sender (Print Line)
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Auto-synced from Rate Master
                    </span>
                  </div>
                  <input
                    type="text"
                    value={fromSender}
                    onChange={(e) => setFromSender(e.target.value)}
                    placeholder="From :- S G SURAT 9601511329 - 7405415105"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#18476A]/30 focus:outline-hidden"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>Printed on courier slips as sender line</span>
                    <div className="flex items-center gap-3">
                      {fromSender !== defaultSenderMaster && (
                        <>
                          <button
                            type="button"
                            onClick={() => setFromSender(defaultSenderMaster)}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                          >
                            Reset to master
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveAsDefaultSender}
                            className="text-[#18476A] dark:text-cyan-400 hover:underline font-bold cursor-pointer"
                          >
                            Save as Master Default
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Print Slip Preview & Submit Button */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 sticky top-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Printer
                      size={15}
                      className="text-[#18476A] dark:text-cyan-400"
                    />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Slip Preview (Image 2)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    Live
                  </span>
                </div>

                {/* Micro Preview of Slip */}
                <div className="bg-white text-black rounded-xl border-2 border-black font-sans text-xs select-none shadow-xs overflow-hidden">
                  <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-black uppercase p-2.5 pb-2 border-b-2 border-black gap-2">
                    <div className="shrink-0 whitespace-nowrap">
                      {courierType === "VPP"
                        ? "VPP"
                        : `IS:- ${paymentStatus?.toUpperCase() || "UNPAID"}`}
                    </div>
                    <div className="text-right shrink-0 whitespace-nowrap tracking-wide">
                      SERVICE PROVIDER :-{" "}
                      {serviceProvider || "JAY AMBE LOGISTIC"}
                    </div>
                  </div>

                  <div className="py-2.5 px-2 flex items-center justify-between min-h-[85px] relative">
                    {/* Diagonal Cross Line Touching Top Line and Side Line */}
                    <svg
                      className="absolute top-0 left-0 w-[54px] h-[54px] pointer-events-none select-none"
                      viewBox="0 0 100 100"
                    >
                      <line
                        x1="0"
                        y1="100"
                        x2="100"
                        y2="0"
                        stroke="black"
                        strokeWidth="2.5"
                      />
                      <g transform="rotate(-45 50 50)">
                        <text
                          x="50"
                          y="38"
                          textAnchor="middle"
                          fill="black"
                          fontWeight="900"
                          fontSize="11.5"
                          letterSpacing="0.3"
                          fontFamily="system-ui, sans-serif"
                        >
                          Insurance
                        </text>
                        <text
                          x="50"
                          y="64"
                          textAnchor="middle"
                          fill="black"
                          fontWeight="900"
                          fontSize={
                            getTriangleBadgeAmount(
                              effectiveCalculationTotal,
                              insurance,
                            ).length > 7
                              ? "10"
                              : getTriangleBadgeAmount(
                                    effectiveCalculationTotal,
                                    insurance,
                                  ).length > 5
                                ? "11.5"
                                : "13"
                          }
                          letterSpacing="0.2"
                          fontFamily="ui-monospace, monospace"
                        >
                          {getTriangleBadgeAmount(
                            effectiveCalculationTotal,
                            insurance,
                          )}
                        </text>
                      </g>
                    </svg>
                    <div className="w-[56px] shrink-0" />

                    {/* Middle Section: Oval & Side of Round (Fine & Rate) */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isShipmentOver1Lakh(
                        effectiveCalculationTotal,
                        insurance,
                      ) && (
                        <div className="items-center justify-center shrink-0">
                          <div className="border-2 border-black rounded-[50%/50%] px-2.5 py-0.5 font-mono font-black text-xs text-center min-w-[50px]">
                            {getRateInsuranceCode(
                              effectiveCalculationTotal,
                              insurance,
                            )}
                          </div>
                          {/* Side of Round: Fine & Rate (Only shown for VPP, hidden for Normal) */}
                          {courierType === "VPP" && (qty || rate) ? (
                            <div className="text-left font-black text-black uppercase font-mono text-[9px] sm:text-[10px] leading-tight mt-[10px] shrink-0">
                              <div>FINE : {qty || 1}</div>
                              <div>AMOUNT : {rate || 0}</div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Spacer pushing text to right */}
                    <div className="flex-1" />

                    {/* Right: Recipient with Address, Pincode & Phone */}
                    <div className="text-left text-[10px] font-black text-black leading-tight w-[130px] max-w-[140px] shrink-0 pr-1">
                      <div className="uppercase font-black text-black">
                        TO :- {destinationCity || "DELHI"}
                      </div>
                      <div className="uppercase text-black mt-0.5 font-black">
                        {customerName || "RECIPIENT"}
                      </div>
                      {destinationAddress && (
                        <div className="text-[9.5px] font-black text-black line-clamp-2 mt-0.5 leading-snug">
                          {destinationAddress}
                        </div>
                      )}
                      {destinationPincode && (
                        <div className="text-[9.5px] font-black text-black leading-snug">
                          PIN - {destinationPincode}
                        </div>
                      )}
                      {/* Phone Numbers - display both if available, bold with dot */}
                      <div className="mt-0.5 font-mono font-black text-black leading-tight space-y-0.5">
                        {getShipmentPhones(
                          customerPhone,
                          customerPhone2,
                          customerName,
                          selectedCustomerId,
                          customers,
                        ).length > 0 ? (
                          getShipmentPhones(
                            customerPhone,
                            customerPhone2,
                            customerName,
                            selectedCustomerId,
                            customers,
                          ).map((ph, idx) => <div key={idx}>{ph}.</div>)
                        ) : (
                          <div>PHONE.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t-2 border-black p-2 py-1.5 text-[9.5px] font-black text-black uppercase truncate">
                    {fromSender || "From :- S G SURAT 9601511329 - 7405415105"}
                  </div>
                </div>

                {/* Summary Details */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {courierType}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rate & Fine:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {qty} × ₹{Number(rate).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Total Amount:
                    </span>
                    <span className="font-black text-[#18476A] dark:text-cyan-400 font-mono text-sm">
                      ₹{effectiveCalculationTotal.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="space-y-2">
                  {canAdd && (
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-xs font-black uppercase tracking-wider transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer ${
                        courierType === "VPP"
                          ? "bg-purple-600 hover:bg-purple-700"
                          : "bg-[#18476A] hover:bg-[#123955]"
                      }`}
                    >
                      <PackagePlus size={16} />
                      <span>
                        {formSubmitting
                          ? "Booking Consignment..."
                          : "Book & Open Print Slip"}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel & Return to Register
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* LIST VIEW (DEFAULT): 2 TABS (NORMAL & VPP) WITH DISTINCT DATA LISTS */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {/* ── FILTER & SEARCH BAR ─────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Layers size={16} />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Consignment Register
                </div>
                <div className="text-[11px] text-slate-400">
                  Showing {filteredShipments.length} of {shipments.length}{" "}
                  consignments
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1 sm:max-w-xs min-w-[220px]">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search AWB, Bill, Recipient, City, Provider..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs"
                />
              </div>

              {/* Courier Type Filter Dropdown */}
              <select
                value={courierTab}
                onChange={(e) =>
                  setCourierTab(e.target.value as "All" | "Normal" | "VPP")
                }
                className="px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden shadow-2xs cursor-pointer"
              >
                <option value="All">All Types ({shipments.length})</option>
                <option value="Normal">
                  Normal Courier ({normalShipments.length})
                </option>
                <option value="VPP">VPP Courier ({vppShipments.length})</option>
              </select>

              {/* Payment Filter Dropdown - only for All or Normal (VPP has no paid/unpaid) */}
              {courierTab !== "VPP" && (
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden shadow-2xs cursor-pointer"
                >
                  <option value="All">All Payments</option>
                  <option value="Paid">Is: Paid</option>
                  <option value="Unpaid">Is: Unpaid</option>
                </select>
              )}

              {/* Multi-select Print Button in Filter Bar */}
              {selectedShipmentIds.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrintSelected}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0 animate-in fade-in"
                  title="Print all selected consignments"
                >
                  <Printer size={15} />
                  <span>Print Selected ({selectedShipmentIds.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* ── COMPACT METRICS STRIP ───────────────────────────────────── */}
          {courierTab === "All" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    Consignments:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white">
                    {allMetrics.total}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[#18476A] dark:text-cyan-400 uppercase">
                    Normal:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#18476A]/10 text-[#18476A] dark:bg-cyan-950/60 dark:text-cyan-300 border border-[#18476A]/20 dark:border-cyan-800 font-mono font-bold">
                    {normalMetrics.total}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase">
                    VPP:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 font-mono font-bold text-purple-700 dark:text-purple-300">
                    {vppMetrics.total}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                    Paid:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {allMetrics.paid}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase">
                    Unpaid:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 font-mono font-bold text-rose-700 dark:text-rose-300">
                    {allMetrics.unpaid}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Total Bill Value:
                </span>
                <span className="text-sm font-black text-[#18476A] dark:text-cyan-400 font-mono">
                  ₹{allMetrics.amount.toLocaleString()}
                </span>
              </div>
            </div>
          ) : courierTab === "Normal" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">
                    Consignments:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white">
                    {normalMetrics.total}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                    Paid:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {normalMetrics.paid}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase">
                    Unpaid:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 font-mono font-bold text-rose-700 dark:text-rose-300">
                    {normalMetrics.unpaid}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  Total Bill Value:
                </span>
                <span className="text-sm font-black text-[#18476A] dark:text-cyan-400 font-mono">
                  ₹{normalMetrics.amount.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 uppercase">
                    VPP Consignments:
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 font-mono font-bold text-purple-800 dark:text-purple-300">
                    {vppMetrics.total}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase">
                  Total VPP Collection:
                </span>
                <span className="text-sm font-black text-purple-700 dark:text-purple-300 font-mono">
                  ₹{vppMetrics.amount.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* ── MULTI-SELECT SELECTION TOOLBAR ────────────────────────────── */}
          {selectedShipmentIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#18476A]/10 dark:bg-cyan-950/40 border border-[#18476A]/30 dark:border-cyan-800 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-[#18476A] dark:text-cyan-300">
                  {selectedShipmentIds.length} of {filteredShipments.length} consignment{filteredShipments.length > 1 ? "s" : ""} selected
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                {selectedShipmentIds.length < filteredShipments.length && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-xs font-bold text-[#18476A] dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    Select all {filteredShipments.length}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline cursor-pointer ml-1"
                >
                  Clear selection
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintSelected}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Selected ({selectedShipmentIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* ── UNIFIED COURIER CONSIGNMENT REGISTER (NORMAL & VPP) ─────── */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[620px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 shadow-xs">
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-3.5 w-10 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          pagedShipments.length > 0 &&
                          pagedShipments.every((s) =>
                            selectedShipmentIds.includes(s._id)
                          )
                        }
                        onChange={handleToggleSelectPage}
                        className="w-4 h-4 rounded text-[#18476A] focus:ring-[#18476A] border-slate-300 dark:border-slate-600 dark:bg-slate-800 cursor-pointer"
                        title="Select/Deselect all on this page"
                      />
                    </th>
                    <th className="px-4 py-3.5 w-12 text-center whitespace-nowrap">
                      #
                    </th>
                    <th className="px-4 py-3.5 min-w-[190px] whitespace-nowrap">
                      AWB / Date
                    </th>
                    <th className="px-4 py-3.5 min-w-[100px] whitespace-nowrap">
                      Type
                    </th>
                    <th className="px-4 py-3.5 min-w-[90px] whitespace-nowrap">
                      Bill No
                    </th>
                    <th className="px-4 py-3.5 min-w-[250px] whitespace-nowrap">
                      Recipient (TO)
                    </th>
                    <th className="px-4 py-3.5 min-w-[140px] whitespace-nowrap">
                      Provider
                    </th>
                    {courierTab !== "VPP" && (
                      <th className="px-4 py-3.5 min-w-[100px] whitespace-nowrap">
                        Payment
                      </th>
                    )}
                    <th className="px-4 py-3.5 min-w-[90px] whitespace-nowrap">
                      Fine
                    </th>
                    <th className="px-4 py-3.5 min-w-[100px] whitespace-nowrap">
                      Amount
                    </th>
                    <th className="px-4 py-3.5 min-w-[130px] whitespace-nowrap">
                      Total Amount
                    </th>
                    <th className="px-4 py-3.5 min-w-[130px] whitespace-nowrap">
                      Ins & Code
                    </th>
                    <th className="px-4 py-3.5 min-w-[150px] text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={courierTab === "VPP" ? 12 : 13}
                        className="px-4 py-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw
                            size={22}
                            className="animate-spin text-[#18476A]"
                          />
                          <span>Loading consignment records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredShipments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={courierTab === "VPP" ? 12 : 13}
                        className="px-4 py-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Package
                            size={32}
                            className="text-slate-300 dark:text-slate-600"
                          />
                          <span className="font-bold text-slate-600 dark:text-slate-400">
                            No consignment records found
                          </span>
                          <span className="text-xs text-slate-400">
                            Book a new consignment using the buttons above
                          </span>
                          {canAdd && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => openCreateForm("Normal")}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold shadow-xs cursor-pointer"
                              >
                                <Plus size={14} />
                                <span>Create Normal Courier</span>
                              </button>
                              <button
                                onClick={() => openCreateForm("VPP")}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                              >
                                <Plus size={14} />
                                <span>Create VPP Courier</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedShipments.map((ship, idx) => {
                      const isVpp = ship.courierType === "VPP";
                      const isSelected = selectedShipmentIds.includes(ship._id);
                      return (
                        <tr
                          key={ship._id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition border-b border-slate-100 dark:border-slate-800 ${
                            isSelected
                              ? "bg-blue-50/70 dark:bg-cyan-950/25"
                              : ""
                          }`}
                        >
                          {/* Multi-Select Checkbox */}
                          <td className="px-3 py-3.5 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(ship._id)}
                              className="w-4 h-4 rounded text-[#18476A] focus:ring-[#18476A] border-slate-300 dark:border-slate-600 dark:bg-slate-800 cursor-pointer"
                            />
                          </td>

                          {/* Row Number */}
                          <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-500 whitespace-nowrap">
                            {(safeCurrentPage - 1) * pageSize + idx + 1}
                          </td>

                          {/* AWB & Date */}
                          <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {ship.awbNumber}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                              <Clock size={10} className="shrink-0" />
                              <span className="whitespace-nowrap">
                                {new Date(
                                  ship.dispatchDate ||
                                    ship.createdAt ||
                                    Date.now(),
                                ).toLocaleDateString()}{" "}
                                {new Date(
                                  ship.dispatchDate ||
                                    ship.createdAt ||
                                    Date.now(),
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </td>

                          {/* Courier Type Badge */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {isVpp ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 shrink-0">
                                <CreditCard size={11} className="shrink-0" />
                                <span className="whitespace-nowrap">VPP</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap bg-[#18476A]/10 text-[#18476A] dark:bg-cyan-500/20 dark:text-cyan-300 border border-[#18476A]/20 dark:border-cyan-800/60 shrink-0">
                                <Package size={11} className="shrink-0" />
                                <span className="whitespace-nowrap">
                                  Normal
                                </span>
                              </span>
                            )}
                          </td>

                          {/* Bill No */}
                          <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                            <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {ship.billNo || "—"}
                            </span>
                          </td>

                          {/* Recipient Details (TO) */}
                          <td className="px-4 py-3.5 min-w-[250px] whitespace-nowrap">
                            <div className="font-bold text-slate-900 dark:text-white uppercase whitespace-nowrap">
                              {ship.customerName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-0.5 mt-0.5">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <MapPin
                                  size={11}
                                  className={
                                    isVpp
                                      ? "text-purple-600 dark:text-purple-400 shrink-0"
                                      : "text-[#18476A] dark:text-cyan-400 shrink-0"
                                  }
                                />
                                <span className="uppercase font-semibold whitespace-nowrap">
                                  {ship.destinationCity}
                                  {ship.destinationPincode
                                    ? ` (${ship.destinationPincode})`
                                    : ""}
                                </span>
                              </div>
                              {getShipmentPhones(
                                ship.customerPhone,
                                ship.customerPhone2,
                                ship.customerName,
                                ship.customerCode,
                                customers,
                              ).length > 0 && (
                                <div className="flex items-center gap-1 text-[10.5px] font-mono text-slate-400 whitespace-nowrap">
                                  <Phone size={10} className="shrink-0" />
                                  <span>
                                    {getShipmentPhones(
                                      ship.customerPhone,
                                      ship.customerPhone2,
                                      ship.customerName,
                                      ship.customerCode,
                                      customers,
                                    ).join(" / ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Service Provider */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50/80 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50 uppercase whitespace-nowrap shrink-0">
                              <Truck size={12} className="shrink-0" />
                              <span className="whitespace-nowrap">
                                {ship.serviceProvider}
                              </span>
                            </span>
                          </td>

                          {/* Payment / Collection Status */}
                          {courierTab !== "VPP" && (
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {isVpp ? (
                                <span className="text-slate-400 dark:text-slate-500 font-bold text-xs whitespace-nowrap">
                                  —
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0 ${
                                    ship.paymentStatus === "Paid"
                                      ? "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                                      : "bg-rose-100/80 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60"
                                  }`}
                                >
                                  {ship.paymentStatus === "Paid"
                                    ? "Paid"
                                    : "Unpaid"}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Fine */}
                          <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {ship.qty || 1}
                            </div>
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              ₹{(Number(ship.rate) || 0).toLocaleString()}
                            </div>
                          </td>

                          {/* Total Amount */}
                          <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                            <div className="font-black text-slate-900 dark:text-white text-sm whitespace-nowrap">
                              ₹
                              {(Number(ship.totalAmount) || 0).toLocaleString()}
                            </div>
                          </td>

                          {/* Ins & Code */}
                          <td className="px-4 py-3.5 text-[11px] whitespace-nowrap">
                            {isShipmentOver1Lakh(
                              getShipmentValuation(ship),
                              ship.insurance,
                            ) ? (
                              <>
                                <div className="text-amber-600 dark:text-amber-400 font-mono font-bold whitespace-nowrap">
                                  Ins: ₹
                                  {(
                                    Number(ship.insurance) || 0
                                  ).toLocaleString()}
                                </div>
                                <div className="mt-1">
                                  <span className="inline-block border border-black dark:border-white rounded-[50%/50%] px-2 py-0.5 text-[10px] font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                    {getRateInsuranceCode(
                                      getShipmentValuation(ship),
                                      ship.insurance,
                                    )}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div>
                                <div className="text-amber-600 dark:text-amber-400 font-mono text-[10px] whitespace-nowrap">
                                  Ins: ₹
                                  {(
                                    Number(ship.insurance) || 0
                                  ).toLocaleString()}
                                </div>
                                <div className="mt-0.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                    {getTriangleBadgeAmount(
                                      getShipmentValuation(ship),
                                      ship.insurance,
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Action Buttons: PRINT, EDIT, DELETE */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5 shrink-0">
                              <button
                                onClick={() => handlePrintSlip(ship)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                                  isVpp
                                    ? "bg-purple-100 text-purple-700 hover:bg-purple-700 hover:text-white dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-600 dark:hover:text-white"
                                    : "bg-[#18476A]/10 text-[#18476A] hover:bg-[#18476A] hover:text-white dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500 dark:hover:text-slate-950"
                                }`}
                                title="Print Consignment Slip"
                              >
                                <Printer size={13} className="shrink-0" />
                                <span className="whitespace-nowrap">Print</span>
                              </button>

                              {canUpdate && (
                                <button
                                  onClick={() => handleOpenEdit(ship)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                                  title="Edit Consignment"
                                >
                                  <Edit3 size={15} />
                                </button>
                              )}

                              {canDelete && (
                                <button
                                  onClick={() => handleOpenDelete(ship)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                                  title="Delete Consignment"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {/* Table Footer Totals */}
                {filteredShipments.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20 bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-700 shadow-sm font-mono text-xs">
                    <tr className="font-bold text-slate-800 dark:text-slate-200">
                      <td
                        colSpan={courierTab === "VPP" ? 7 : 8}
                        className="px-4 py-3 text-right uppercase tracking-wider text-[11px] font-black text-slate-500 dark:text-slate-400 whitespace-nowrap"
                      >
                        Total ({filteredShipments.length} consignments):
                      </td>
                      {/* Total Fine */}
                      <td className="px-4 py-3 font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {filteredShipments
                          .reduce(
                            (acc, s) => acc + (parseFloat(String(s.qty)) || 0),
                            0,
                          )
                          .toFixed(2)
                          .replace(/\.00$/, "")}
                      </td>
                      {/* Total Rate / Amount */}
                      <td className="px-4 py-3 font-black text-slate-900 dark:text-white whitespace-nowrap">
                        ₹
                        {filteredShipments
                          .reduce(
                            (acc, s) => acc + (parseFloat(String(s.rate)) || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      {/* Total Calculation Amount */}
                      <td className="px-4 py-3 font-black text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                        ₹
                        {filteredShipments
                          .reduce(
                            (acc, s) =>
                              acc + (parseFloat(String(s.totalAmount)) || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td colSpan={2} className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalCount={filteredShipments.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              recordLabel="consignments"
              showAlways={true}
            />
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          PRINT CONSIGNMENT SLIP MODAL (EXACT MATCH OF USER IMAGE 2)
          ──────────────────────────────────────────────────────────────────────── */}
      {printModalOpen && (slipsToPrint.length > 0 || slipToPrint) && (() => {
        const effectiveSlips = slipsToPrint.length > 0 ? slipsToPrint : slipToPrint ? [slipToPrint] : [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full p-6 space-y-5 max-h-[95vh] overflow-y-auto">
              {/* Modal Controls Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Printer
                    size={18}
                    className="text-[#18476A] dark:text-cyan-400"
                  />
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <span>
                        {effectiveSlips.length > 1
                          ? `Print ${effectiveSlips.length} Consignment Labels`
                          : "Consignment Label Slip"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#18476A]/10 text-[#18476A] dark:bg-cyan-500/10 dark:text-cyan-300 text-[11px] font-mono font-bold">
                        75mm × 50mm
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Standard Thermal Sticker Roll (75mm × 50mm / 3″ × 2″)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={executePrint}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#18476A] text-white text-xs font-bold hover:bg-[#123955] transition shadow-md cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>
                      {effectiveSlips.length > 1
                        ? `Print All ${effectiveSlips.length} Labels (75×50)`
                        : "Print Label (75×50)"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintModalOpen(false);
                      setSlipsToPrint([]);
                      setSlipToPrint(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* PRINT AREA CONTAINER */}
              <div
                id="print-area-wrapper"
                className="p-4 bg-slate-100 dark:bg-slate-950/60 rounded-xl space-y-6 flex flex-col items-center justify-center"
              >
                {effectiveSlips.map((slip, idx) => (
                  <div
                    key={slip._id || idx}
                    className="print-slip-item w-full flex flex-col items-center"
                  >
                    {effectiveSlips.length > 1 && (
                      <div className="print-preview-badge mb-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 self-start max-w-[450px] mx-auto w-full flex justify-between items-center px-1">
                        <span>
                          Label {idx + 1} of {effectiveSlips.length} • {slip.awbNumber}
                        </span>
                        <span className="font-mono text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                          {slip.courierType || "Normal"} • {slip.customerName}
                        </span>
                      </div>
                    )}

                    <div
                      id={idx === 0 ? "printable-courier-slip" : undefined}
                      className="printable-courier-slip w-[450px] max-w-full aspect-[75/50] bg-white text-black font-sans select-text border-2 border-black rounded-sm shadow-sm overflow-hidden flex flex-col justify-between"
                    >
                      {/* 1. TOP ROW: IS:- UNPAID / PAID (or VPP) & SERVICE PROVIDER */}
                      <div className="slip-row-top flex items-center justify-between px-3 py-1.5 text-[12px] font-black tracking-wide border-b-2 border-black gap-2 shrink-0">
                        <div className="uppercase shrink-0 whitespace-nowrap">
                          {slip.courierType === "VPP"
                            ? "VPP"
                            : `IS:- ${slip.paymentStatus?.toUpperCase() || "UNPAID"}`}
                        </div>
                        <div className="uppercase tracking-wide text-right shrink-0 whitespace-nowrap">
                          SERVICE PROVIDER :-{" "}
                          {slip.serviceProvider || "JAY AMBE LOGISTIC"}
                        </div>
                      </div>

                      {/* 2. MIDDLE ROW */}
                      <div className="slip-row-middle py-1.5 px-2 relative flex-1 flex items-start justify-start border-b-2 border-black min-h-[140px] overflow-hidden gap-1">
                        {/* Left Column: Triangle in Corner + Oval Badge & VPP Fine/Amount */}
                        <div className="slip-left-col relative w-[135px] shrink-0 flex flex-col items-center justify-start pt-10">
                          {/* Left: Diagonal Cross Line Touching Top Divider and Side Border */}
                          <svg
                            className="slip-triangle-svg absolute top-0 left-0 w-[64px] h-[64px] pointer-events-none select-none"
                            viewBox="0 0 100 100"
                          >
                            <line
                              x1="0"
                              y1="100"
                              x2="100"
                              y2="0"
                              stroke="black"
                              strokeWidth="2.5"
                            />
                            <g transform="rotate(-45 50 50)">
                              <text
                                x="50"
                                y="38"
                                textAnchor="middle"
                                fill="black"
                                fontWeight="900"
                                fontSize="11.5"
                                letterSpacing="0.4"
                                fontFamily="system-ui, -apple-system, sans-serif"
                              >
                                Insurance
                              </text>
                              <text
                                x="50"
                                y="64"
                                textAnchor="middle"
                                fill="black"
                                fontWeight="900"
                                fontSize={
                                  getTriangleBadgeAmount(
                                    getShipmentValuation(slip),
                                    slip.insurance,
                                  ).length > 7
                                    ? "10"
                                    : getTriangleBadgeAmount(
                                          getShipmentValuation(slip),
                                          slip.insurance,
                                        ).length > 5
                                      ? "11.5"
                                      : "13"
                                }
                                letterSpacing="0.3"
                                fontFamily="ui-monospace, monospace"
                              >
                                {getTriangleBadgeAmount(
                                  getShipmentValuation(slip),
                                  slip.insurance,
                                )}
                              </text>
                            </g>
                          </svg>

                          {/* Oval & Fine/Rate with comfortable clearance */}
                          <div className="slip-oval-block flex flex-col items-center justify-start w-full ml-3.5 mt-0.5">
                            {isShipmentOver1Lakh(
                              getShipmentValuation(slip),
                              slip.insurance,
                            ) && (
                              <div className="slip-oval-badge border-2 border-black rounded-[50%/50%] px-3 py-1 min-w-[78px] text-center shadow-xs">
                                <span className="text-[17px] font-black tracking-wider font-mono">
                                  {getRateInsuranceCode(
                                    getShipmentValuation(slip),
                                    slip.insurance,
                                  )}
                                </span>
                              </div>
                            )}
                            {/* Beside Round Oval: Fine & Rate (Only shown for VPP, hidden for Normal) */}
                            {slip.courierType === "VPP" &&
                            (slip.qty || slip.rate) ? (
                              <div className="slip-fine-rate-block text-center font-black text-black uppercase font-mono text-[12.5px] leading-tight mt-3.5 tracking-wide shrink-0 flex flex-col gap-1.5 whitespace-nowrap">
                                <div className="slip-fine-line">FINE : {slip.qty || 1}</div>
                                <div className="slip-amt-line mt-1.5">AMOUNT : {slip.rate || 0}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Right: Full Recipient Details (Expanded width, NO CUT, NO HIDE) */}
                        <div className="slip-recipient-box flex-1 text-left pl-3 pr-1 pt-2.5 text-[12px] font-black text-black leading-tight overflow-visible">
                          <div className="slip-recipient-city uppercase tracking-wide font-black text-black text-[12.5px]">
                            TO :- {slip.destinationCity || "DELHI"}
                          </div>
                          <div className="slip-recipient-name uppercase mt-0.5 text-black font-black text-[12px]">
                            {slip.customerName || "RECIPIENT"}
                          </div>
                          {slip.destinationAddress && (
                            <div className="slip-recipient-addr text-[11px] font-black text-black mt-0.5 leading-tight break-words">
                              {slip.destinationAddress}
                            </div>
                          )}
                          {slip.destinationPincode && (
                            <div className="slip-recipient-pin text-[11.5px] font-black text-black leading-tight mt-0.5 font-mono">
                              PIN - {slip.destinationPincode}
                            </div>
                          )}
                          {/* Phone Numbers - display both if available, bold with dot */}
                          <div className="slip-recipient-phone mt-0.5 font-mono font-black text-black tracking-tight text-[11.5px] leading-tight space-y-0.5">
                            {getShipmentPhones(
                              slip.customerPhone,
                              slip.customerPhone2,
                              slip.customerName,
                              slip.customerCode,
                              customers,
                            ).length > 0 ? (
                              getShipmentPhones(
                                slip.customerPhone,
                                slip.customerPhone2,
                                slip.customerName,
                                slip.customerCode,
                                customers,
                              ).map((ph, phIdx) => (
                                <div key={phIdx}>{ph}.</div>
                              ))
                            ) : (
                              <div>—</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3. SENDER ROW: From :- S G SURAT 9601511329 - 7405415105 */}
                      <div className="slip-row-sender py-1.5 px-3 text-[11px] font-black text-black uppercase tracking-wide border-t border-black truncate shrink-0">
                        {slip.fromSender ||
                          "From :- S G SURAT 9601511329 - 7405415105"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Bottom Actions */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">
                  {effectiveSlips.length > 1
                    ? `${effectiveSlips.length} slips configured for 75mm × 50mm thermal sticker roll printers with 1 label per page.`
                    : "Print layout configured for standard 75mm × 50mm (3″ × 2″) thermal sticker label rolls."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPrintModalOpen(false);
                    setSlipsToPrint([]);
                    setSlipToPrint(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ────────────────────────────────────────────────────────────────────────
          EDIT MODAL
          ──────────────────────────────────────────────────────────────────────── */}
      {editModalOpen && editingShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl lg:max-w-4xl w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3
                  size={18}
                  className="text-[#18476A] dark:text-cyan-400"
                />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Edit Consignment: {editingShipment.awbNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Type and Payment Status */}
              <div
                className={
                  editingShipment.courierType === "Normal"
                    ? "grid grid-cols-2 gap-3"
                    : "grid grid-cols-1 gap-3"
                }
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Courier Type
                  </label>
                  <div className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white">
                    {editingShipment.courierType} Courier
                  </div>
                </div>

                {editingShipment.courierType === "Normal" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingShipment({
                            ...editingShipment,
                            paymentStatus: "Unpaid",
                          })
                        }
                        className={`py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                          editingShipment.paymentStatus === "Unpaid"
                            ? "bg-rose-600 text-white border-rose-600"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        Unpaid
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingShipment({
                            ...editingShipment,
                            paymentStatus: "Paid",
                          })
                        }
                        className={`py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                          editingShipment.paymentStatus === "Paid"
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        Paid
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bill No & Service Provider */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Bill No *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShipment.billNo || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        billNo: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white font-mono focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Service Provider *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShipment.serviceProvider || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        serviceProvider: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShipment.customerName}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        customerName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShipment.destinationCity}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        destinationCity: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white uppercase focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Recipient Phone 1 & 2 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Phone 1
                  </label>
                  <input
                    type="text"
                    value={editingShipment.customerPhone || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        customerPhone: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Phone 2
                  </label>
                  <input
                    type="text"
                    value={editingShipment.customerPhone2 || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        customerPhone2: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Destination Address
                  </label>
                  <input
                    type="text"
                    placeholder="Address..."
                    value={editingShipment.destinationAddress || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        destinationAddress: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pincode
                  </label>
                  <input
                    type="text"
                    placeholder="Pincode"
                    value={editingShipment.destinationPincode || ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        destinationPincode: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Fine & Rate (Total omitted for VPP) */}
              {editingShipment.courierType === "Normal" ? (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fine
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={editingShipment.qty ?? ""}
                      onChange={(e) => {
                        const newQty = e.target.value;
                        const numQ = parseFloat(newQty) || 0;
                        const numR =
                          parseFloat(String(editingShipment.rate)) || 0;
                        setEditingShipment({
                          ...editingShipment,
                          qty: newQty,
                          totalAmount: Math.round(numQ * numR * 100) / 100,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Rate (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={editingShipment.rate ?? ""}
                      onChange={(e) => {
                        const newRate = e.target.value;
                        const numR = parseFloat(newRate) || 0;
                        const numQ =
                          parseFloat(String(editingShipment.qty)) || 0;
                        setEditingShipment({
                          ...editingShipment,
                          rate: newRate,
                          totalAmount: Math.round(numQ * numR * 100) / 100,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Total
                    </label>
                    <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black text-emerald-600 font-mono">
                      ₹
                      {(
                        Math.round(
                          (parseFloat(String(editingShipment.qty)) || 0) *
                            (parseFloat(String(editingShipment.rate)) || 0) *
                            100,
                        ) / 100 || 0
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fine
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={editingShipment.qty ?? ""}
                      onChange={(e) => {
                        const newQty = e.target.value;
                        const numQ = parseFloat(newQty) || 0;
                        const numR =
                          parseFloat(String(editingShipment.rate)) || 0;
                        const newTotal =
                          masterGoldRate > 0
                            ? Math.round(numQ * masterGoldRate * 100) / 100
                            : Math.round(numQ * numR * 100) / 100;
                        setEditingShipment({
                          ...editingShipment,
                          qty: newQty,
                          totalAmount: newTotal,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Amount / Rate (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={editingShipment.rate ?? ""}
                      onChange={(e) => {
                        const newRate = e.target.value;
                        const numR = parseFloat(newRate) || 0;
                        const numQ =
                          parseFloat(String(editingShipment.qty)) || 0;
                        const newTotal =
                          masterGoldRate > 0
                            ? Math.round(numQ * masterGoldRate * 100) / 100
                            : Math.round(numQ * numR * 100) / 100;
                        setEditingShipment({
                          ...editingShipment,
                          rate: newRate,
                          totalAmount: newTotal,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Insurance & Calculation Token */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Insurance (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingShipment.insurance ?? ""}
                    onChange={(e) =>
                      setEditingShipment({
                        ...editingShipment,
                        insurance: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isShipmentOver1Lakh(
                        getShipmentValuation(editingShipment),
                        editingShipment.insurance,
                      )
                        ? "Total Amount − Insurance (₹)"
                        : "Amount in Triangle (Net < ₹1,00,000)"}
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                      {isShipmentOver1Lakh(
                        getShipmentValuation(editingShipment),
                        editingShipment.insurance,
                      )
                        ? "First 3 Digits Token (Net ≥ ₹1,00,000)"
                        : "Net amount shows in triangle; no round circle"}
                    </div>
                  </div>
                  {isShipmentOver1Lakh(
                    getShipmentValuation(editingShipment),
                    editingShipment.insurance,
                  ) ? (
                    <div className="border-2 border-black dark:border-white rounded-[50%/50%] px-4 py-1.5 min-w-[80px] text-center bg-white dark:bg-slate-900 shrink-0">
                      <span className="text-lg font-black font-mono tracking-widest text-slate-900 dark:text-white">
                        {getRateInsuranceCode(
                          getShipmentValuation(editingShipment),
                          editingShipment.insurance,
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-1 text-center shrink-0 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className="text-xs font-mono font-black text-slate-900 dark:text-white">
                        {getTriangleBadgeAmount(
                          getShipmentValuation(editingShipment),
                          editingShipment.insurance,
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* From Sender */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  From Sender Line
                </label>
                <input
                  type="text"
                  value={editingShipment.fromSender || ""}
                  onChange={(e) =>
                    setEditingShipment({
                      ...editingShipment,
                      fromSender: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#18476A] text-white text-xs font-bold hover:bg-[#123955] transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          PROFESSIONAL CENTERED DELETE CONFIRMATION MODAL
          ──────────────────────────────────────────────────────────────────────── */}
      {deleteModalOpen && shipmentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 shadow-xs">
              <AlertTriangle size={28} />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
              Delete Consignment?
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Are you sure you want to delete consignment{" "}
              <strong className="text-slate-900 dark:text-white font-mono">
                {shipmentToDelete.awbNumber}
              </strong>
              {shipmentToDelete.billNo ? (
                <>
                  {" "}
                  (Bill No:{" "}
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                    {shipmentToDelete.billNo}
                  </span>
                  )
                </>
              ) : null}{" "}
              for{" "}
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {shipmentToDelete.customerName}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteSubmitting}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition shadow-xs cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-md hover:shadow-rose-600/25 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {deleteSubmitting ? "Deleting..." : "Yes, Delete Consignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
