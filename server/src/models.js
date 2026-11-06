import mongoose from "mongoose";

const { Schema, model } = mongoose;

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  nameTe: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: "" },
  image: { type: String, trim: true, default: "" },
  category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, min: 0, default: null },
  unit: { type: String, required: true, trim: true },
  stock: { type: Number, min: 0, default: 0 },
  lowStockAt: { type: Number, min: 0, default: 5 },
  active: { type: Boolean, default: true },
  featured: { type: Boolean, default: false }
}, { timestamps: true });
productSchema.index({ name: "text" });
productSchema.index({ category: 1, active: 1 });

const adminSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const customerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, unique: true },
  village: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true }
}, { timestamps: true });

const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
  customerName: { type: String, required: true },
  mobile: { type: String, required: true, index: true },
  village: { type: String, required: true },
  address: { type: String, required: true },
  instructions: { type: String, default: "" },
  items: [{
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    unit: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true }
  }],
  subtotal: { type: Number, required: true },
  deliveryCharge: { type: Number, required: true },
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ["cod", "upi"], default: "cod" },
  gatewayOrderId: { type: String, default: "" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  status: { type: String, enum: ["placed", "accepted", "preparing", "out-for-delivery", "delivered", "cancelled"], default: "placed" }
}, { timestamps: true });
orderSchema.index({ createdAt: -1 });

const paymentSchema = new Schema({
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  provider: { type: String, required: true },
  reference: { type: String, default: "" },
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" }
}, { timestamps: true });

const deliverySettingsSchema = new Schema({
  key: { type: String, default: "store", unique: true },
  shopName: { type: String, default: "D.K. Raju General Store" },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  serviceVillages: { type: [String], default: [] },
  deliveryCharge: { type: Number, min: 0, default: 0 },
  minimumOrder: { type: Number, min: 0, default: 0 },
  estimatedDelivery: { type: String, default: "" }
}, { timestamps: true });

const inventoryTransactionSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  change: { type: Number, required: true },
  reason: { type: String, required: true },
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
  admin: { type: Schema.Types.ObjectId, ref: "Admin", default: null }
}, { timestamps: true });

export const Admin = model("Admin", adminSchema);
export const Category = model("Category", categorySchema);
export const Product = model("Product", productSchema);
export const Customer = model("Customer", customerSchema);
export const Order = model("Order", orderSchema);
export const Payment = model("Payment", paymentSchema);
export const DeliverySettings = model("DeliverySettings", deliverySettingsSchema);
export const InventoryTransaction = model("InventoryTransaction", inventoryTransactionSchema);