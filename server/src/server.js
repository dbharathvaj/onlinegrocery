import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import Razorpay from "razorpay";
import { v2 as cloudinary } from "cloudinary";
import { rateLimit } from "express-rate-limit";
import { Admin, Category, Customer, DeliverySettings, InventoryTransaction, Order, Payment, Product } from "./models.js";
import { calculateTotals, isServiceable, isValidMobile, normalizeMobile, verifyRazorpaySignature } from "./domain.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const jwtSecret = process.env.JWT_SECRET;
const adminCookie = "dk_admin";

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

app.use(helmet());
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const orderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

function adminOnly(req, res, next) {
  try {
    const token = req.cookies[adminCookie];
    if (!token || !jwtSecret) return res.status(401).json({ message: "Admin login required." });
    req.admin = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ message: "Admin session expired. Please sign in again." });
  }
}

function safeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    items: order.items,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    createdAt: order.createdAt
  };
}

function validProductInput(body) {
  return typeof body.name === "string" && body.name.trim() && mongoose.isValidObjectId(body.category)
    && Number.isFinite(Number(body.price)) && Number(body.price) >= 0
    && typeof body.unit === "string" && body.unit.trim()
    && Number.isFinite(Number(body.stock)) && Number(body.stock) >= 0;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await Admin.findOne({ email });
  if (!existing) await Admin.create({ email, passwordHash: await bcrypt.hash(password, 12) });
}

app.get("/api/health", (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

app.get("/api/categories", async (req, res, next) => {
  try { res.json(await Category.find({ active: true }).sort({ name: 1 }).lean()); } catch (error) { next(error); }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
    const filter = { active: true, stock: { $gt: 0 } };
    if (mongoose.isValidObjectId(req.query.category)) filter.category = req.query.category;
    if (typeof req.query.search === "string" && req.query.search.trim()) filter.name = { $regex: req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const [products, total] = await Promise.all([
      Product.find(filter).populate("category", "name nameTe").sort({ featured: -1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter)
    ]);
    res.json({ products, page, pages: Math.ceil(total / limit), total });
  } catch (error) { next(error); }
});

app.get("/api/settings", async (req, res, next) => {
  try {
    const settings = await DeliverySettings.findOne({ key: "store" }).lean();
    if (!settings) return res.json({ shopName: "D.K. Raju General Store", address: "", phone: "", serviceVillages: [], deliveryCharge: 0, minimumOrder: 0, estimatedDelivery: "" });
    res.json(settings);
  } catch (error) { next(error); }
});

app.get("/api/payments/config", (req, res) => {
  res.json({ upiEnabled: Boolean(razorpayClient()), keyId: process.env.RAZORPAY_KEY_ID || "" });
});

app.post("/api/orders", orderLimiter, async (req, res, next) => {
  let reserved = [];
  let createdOrder = null;
  try {
    const { name, mobile, village, address, instructions = "", items, idempotencyKey } = req.body;
    const paymentMethod = req.body.paymentMethod === "upi" ? "upi" : "cod";
    const normalizedMobile = normalizeMobile(mobile);
    if (typeof name !== "string" || name.trim().length < 2 || !isValidMobile(normalizedMobile)
      || typeof village !== "string" || !village.trim() || typeof address !== "string" || address.trim().length < 5
      || !Array.isArray(items) || items.length < 1 || items.length > 30
      || typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 100) {
      return res.status(400).json({ message: "Please check your name, 10-digit mobile number, address and cart." });
    }
    const priorOrder = await Order.findOne({ idempotencyKey });
    if (priorOrder) {
      if (priorOrder.paymentMethod !== paymentMethod) return res.status(409).json({ message: "This checkout was already started with another payment method." });
      const payment = priorOrder.paymentMethod === "upi" && priorOrder.paymentStatus !== "paid" ? await Payment.findOne({ order: priorOrder._id }).lean() : null;
      return res.status(200).json({ order: safeOrder(priorOrder), duplicate: true, ...(payment ? { payment: { provider: "razorpay", keyId: process.env.RAZORPAY_KEY_ID, gatewayOrderId: priorOrder.gatewayOrderId, amount: Math.round(priorOrder.total * 100), currency: "INR" } } : {}) });
    }
    if (paymentMethod === "upi" && !razorpayClient()) return res.status(503).json({ message: "Online UPI payment is not configured. Please choose cash on delivery." });
    const settings = await DeliverySettings.findOne({ key: "store" }).lean();
    if (!settings || !isServiceable(village, settings.serviceVillages)) return res.status(400).json({ message: "This delivery location is not currently serviceable." });
    const requested = new Map();
    for (const item of items) {
      if (!mongoose.isValidObjectId(item.productId) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 50) {
        return res.status(400).json({ message: "One or more cart items are invalid." });
      }
      requested.set(String(item.productId), (requested.get(String(item.productId)) || 0) + Number(item.quantity));
    }
    if ([...requested.values()].some((quantity) => quantity > 50)) return res.status(400).json({ message: "Please reduce the quantity of a cart item." });
    const snapshot = [];
    for (const [productId, quantity] of requested) {
      const product = await Product.findOneAndUpdate(
        { _id: productId, active: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      ).populate("category", "name");
      if (!product) throw Object.assign(new Error("A product is unavailable or no longer has enough stock."), { status: 409 });
      reserved.push({ product, quantity });
      snapshot.push({ product: product._id, name: product.name, image: product.image, unit: product.unit, price: product.price, quantity });
    }
    const totals = calculateTotals(snapshot, Number(settings.deliveryCharge) || 0);
    if (totals.subtotal < (Number(settings.minimumOrder) || 0)) throw Object.assign(new Error("The cart is below the minimum order amount."), { status: 400 });
    const customer = await Customer.findOneAndUpdate(
      { mobile: normalizedMobile },
      { name: name.trim(), mobile: normalizedMobile, village: village.trim(), address: address.trim() },
      { new: true, upsert: true, runValidators: true }
    );
    const order = await Order.create({
      orderNumber: `DK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      idempotencyKey,
      customer: customer._id,
      customerName: name.trim(),
      mobile: normalizedMobile,
      village: village.trim(),
      address: address.trim(),
      instructions: String(instructions).slice(0, 500),
      items: snapshot,
      ...totals,
      paymentMethod,
      paymentStatus: "pending"
    });
    createdOrder = order;
    let paymentDetails = null;
    if (paymentMethod === "upi") {
      const gatewayOrder = await razorpayClient().orders.create({ amount: Math.round(order.total * 100), currency: "INR", receipt: order.orderNumber });
      order.gatewayOrderId = gatewayOrder.id;
      await order.save();
      await Payment.create({ order: order._id, provider: "razorpay", reference: gatewayOrder.id, status: "pending" });
      paymentDetails = { provider: "razorpay", keyId: process.env.RAZORPAY_KEY_ID, gatewayOrderId: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency };
    }
    await InventoryTransaction.insertMany(reserved.map(({ product, quantity }) => ({ product: product._id, change: -quantity, reason: "Order placed", order: order._id })));
    res.status(201).json({ order: safeOrder(order), ...(paymentDetails ? { payment: paymentDetails } : {}) });
  } catch (error) {
    if (createdOrder) await Payment.deleteOne({ order: createdOrder._id }).catch(() => {});
    if (createdOrder) await Order.deleteOne({ _id: createdOrder._id }).catch(() => {});
    await Promise.allSettled(reserved.map(({ product, quantity }) => Product.updateOne({ _id: product._id }, { $inc: { stock: quantity } })));
    next(error);
  }
});

app.post("/api/payments/verify", orderLimiter, async (req, res, next) => {
  try {
    const { orderNumber, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    const order = await Order.findOne({ orderNumber, gatewayOrderId, paymentMethod: "upi" });
    const gateway = razorpayClient();
    if (!gateway || !order || !paymentId || !signature) return res.status(400).json({ message: "Payment details could not be verified." });
    if (!verifyRazorpaySignature(gatewayOrderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) return res.status(400).json({ message: "Payment signature is invalid." });
    if (order.paymentStatus === "paid") return res.json({ order: safeOrder(order) });
    const captured = await gateway.payments.fetch(paymentId);
    if (captured.order_id !== gatewayOrderId || captured.amount !== Math.round(order.total * 100) || captured.currency !== "INR" || captured.status !== "captured") {
      return res.status(400).json({ message: "The gateway has not confirmed this payment." });
    }
    const paidOrder = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: "pending" }, { $set: { paymentStatus: "paid" } }, { new: true });
    await Payment.findOneAndUpdate({ order: order._id }, { provider: "razorpay", reference: paymentId, status: "paid" }, { upsert: true, new: true });
    res.json({ order: safeOrder(paidOrder || order) });
  } catch (error) { next(error); }
});

app.post("/api/payments/fail", orderLimiter, async (req, res, next) => {
  try {
    const order = await Order.findOneAndUpdate(
      { gatewayOrderId: String(req.body.gatewayOrderId || ""), paymentMethod: "upi", paymentStatus: "pending", status: { $nin: ["cancelled", "delivered"] } },
      { $set: { paymentStatus: "failed", status: "cancelled" } },
      { new: true }
    );
    if (!order) return res.json({ ok: true });
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
      await InventoryTransaction.create({ product: item.product, change: item.quantity, reason: "Failed UPI payment stock restored", order: order._id });
    }
    await Payment.findOneAndUpdate({ order: order._id }, { status: "failed" }, { upsert: true, new: true });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/orders/lookup", orderLimiter, async (req, res, next) => {
  try {
    const orderNumber = String(req.body.orderNumber || "").trim().toUpperCase();
    const mobile = normalizeMobile(req.body.mobile);
    if (!orderNumber || !isValidMobile(mobile)) return res.status(400).json({ message: "Enter a valid order number and mobile number." });
    const order = await Order.findOne({ orderNumber, mobile }).lean();
    if (!order) return res.status(404).json({ message: "We could not find an order matching those details." });
    res.json({ order: safeOrder(order) });
  } catch (error) { next(error); }
});

app.post("/api/admin/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(String(req.body.password || ""), admin.passwordHash))) return res.status(401).json({ message: "Email or password is incorrect." });
    if (!jwtSecret) return res.status(503).json({ message: "Admin authentication is not configured." });
    const token = jwt.sign({ id: admin.id, email: admin.email }, jwtSecret, { expiresIn: "8h" });
    res.cookie(adminCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 });
    res.json({ admin: { email: admin.email } });
  } catch (error) { next(error); }
});

app.post("/api/admin/logout", adminOnly, (req, res) => { res.clearCookie(adminCookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); res.status(204).end(); });
app.get("/api/admin/me", adminOnly, (req, res) => res.json({ admin: { email: req.admin.email } }));

app.get("/api/admin/overview", adminOnly, async (req, res, next) => {
  try {
    const [orders, newOrders, deliveredOrders, products, lowStock, sales] = await Promise.all([
      Order.countDocuments(), Order.countDocuments({ status: "placed" }), Order.countDocuments({ status: "delivered" }),
      Product.countDocuments({ active: true }), Product.find({ active: true, $expr: { $lte: ["$stock", "$lowStockAt"] } }).select("name stock unit").limit(30).lean(),
      Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } }])
    ]);
    res.json({ orders, newOrders, deliveredOrders, products, lowStock, paidSales: sales[0]?.total || 0 });
  } catch (error) { next(error); }
});

app.get("/api/admin/products", adminOnly, async (req, res, next) => {
  try { res.json(await Product.find().populate("category", "name nameTe").sort({ updatedAt: -1 }).lean()); } catch (error) { next(error); }
});

app.post("/api/admin/products", adminOnly, async (req, res, next) => {
  try {
    if (!validProductInput(req.body)) return res.status(400).json({ message: "Product name, category, price, unit and stock are required." });
    const product = await Product.create({ ...req.body, name: req.body.name.trim(), price: Number(req.body.price), stock: Number(req.body.stock), originalPrice: req.body.originalPrice === "" ? null : req.body.originalPrice });
    res.status(201).json(await product.populate("category", "name nameTe"));
  } catch (error) { next(error); }
});

app.patch("/api/admin/products/:id", adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product." });
    const update = { ...req.body };
    if (update.price !== undefined) update.price = Number(update.price);
    if (update.stock !== undefined) update.stock = Number(update.stock);
    if (update.stock !== undefined && (!Number.isFinite(update.stock) || update.stock < 0)) return res.status(400).json({ message: "Stock must be zero or more." });
    if (update.price !== undefined && (!Number.isFinite(update.price) || update.price < 0)) return res.status(400).json({ message: "Price must be zero or more." });
    const previousStock = update.stock !== undefined ? await Product.findById(req.params.id).select("stock").lean() : null;
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate("category", "name nameTe");
    if (!product) return res.status(404).json({ message: "Product not found." });
    if (update.stock !== undefined && previousStock) await InventoryTransaction.create({ product: product._id, change: update.stock - previousStock.stock, reason: "Admin stock update", admin: req.admin.id });
    res.json(product);
  } catch (error) { next(error); }
});

app.delete("/api/admin/products/:id", adminOnly, async (req, res, next) => {
  try { const product = await Product.findByIdAndUpdate(req.params.id, { active: false }, { new: true }); if (!product) return res.status(404).json({ message: "Product not found." }); res.status(204).end(); } catch (error) { next(error); }
});

app.get("/api/admin/categories", adminOnly, async (req, res, next) => {
  try { res.json(await Category.find().sort({ name: 1 }).lean()); } catch (error) { next(error); }
});
app.post("/api/admin/categories", adminOnly, async (req, res, next) => {
  try { if (!String(req.body.name || "").trim()) return res.status(400).json({ message: "Category name is required." }); res.status(201).json(await Category.create({ name: req.body.name.trim(), nameTe: String(req.body.nameTe || "").trim() })); } catch (error) { next(error); }
});
app.patch("/api/admin/categories/:id", adminOnly, async (req, res, next) => {
  try { const category = await Category.findByIdAndUpdate(req.params.id, { name: req.body.name?.trim(), nameTe: req.body.nameTe?.trim(), active: req.body.active }, { new: true, runValidators: true }); if (!category) return res.status(404).json({ message: "Category not found." }); res.json(category); } catch (error) { next(error); }
});

app.get("/api/admin/orders", adminOnly, async (req, res, next) => {
  try { res.json(await Order.find().sort({ createdAt: -1 }).limit(200).lean()); } catch (error) { next(error); }
});

app.patch("/api/admin/orders/:id/status", adminOnly, async (req, res, next) => {
  try {
    const allowed = ["placed", "accepted", "preparing", "out-for-delivery", "delivered", "cancelled"];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid order status." });
    if (req.body.status === "cancelled") {
      const order = await Order.findOneAndUpdate(
        { _id: req.params.id, status: { $nin: ["cancelled", "delivered"] } },
        { $set: { status: "cancelled" } },
        { new: true, runValidators: true }
      );
      if (!order) return res.status(409).json({ message: "This order no longer exists or can no longer be changed." });
      for (const item of order.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
        await InventoryTransaction.create({ product: item.product, change: item.quantity, reason: "Cancelled order stock restored", order: order._id, admin: req.admin.id });
      }
      return res.json(order);
    }
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $nin: ["cancelled", "delivered"] } },
      { $set: { status: req.body.status } },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(409).json({ message: "This order no longer exists or can no longer be changed." });
    res.json(order);
  } catch (error) { next(error); }
});

app.patch("/api/admin/orders/:id/payment", adminOnly, async (req, res, next) => {
  try {
    if (!["pending", "paid"].includes(req.body.paymentStatus)) return res.status(400).json({ message: "Invalid payment status." });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, paymentMethod: "cod" },
      { $set: { paymentStatus: req.body.paymentStatus } },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ message: "Cash-on-delivery order not found." });
    await Payment.findOneAndUpdate(
      { order: order._id },
      { provider: "cash-on-delivery", reference: req.body.paymentStatus === "paid" ? "cash-collected" : "", status: req.body.paymentStatus },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(order);
  } catch (error) { next(error); }
});

app.get("/api/admin/reports", adminOnly, async (req, res, next) => {
  try {
    const period = ["daily", "weekly", "monthly"].includes(req.query.period) ? req.query.period : "daily";
    const start = new Date();
    if (period === "daily") start.setHours(0, 0, 0, 0);
    if (period === "weekly") {
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    }
    if (period === "monthly") { start.setDate(1); start.setHours(0, 0, 0, 0); }
    const match = { createdAt: { $gte: start }, status: { $ne: "cancelled" } };
    const [totals, bestSellers] = await Promise.all([
      Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, grossSales: { $sum: "$total" }, collected: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } } } }]),
      Order.aggregate([{ $match: match }, { $unwind: "$items" }, { $group: { _id: "$items.name", quantity: { $sum: "$items.quantity" }, sales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } }, { $sort: { quantity: -1 } }, { $limit: 10 }])
    ]);
    res.json({ period, from: start, orders: totals[0]?.orders || 0, grossSales: totals[0]?.grossSales || 0, collected: totals[0]?.collected || 0, bestSellers });
  } catch (error) { next(error); }
});

app.get("/api/admin/settings", adminOnly, async (req, res, next) => {
  try { res.json(await DeliverySettings.findOneAndUpdate({ key: "store" }, {}, { upsert: true, new: true })); } catch (error) { next(error); }
});
app.put("/api/admin/settings", adminOnly, async (req, res, next) => {
  try {
    const settings = { shopName: String(req.body.shopName || "D.K. Raju General Store").trim(), address: String(req.body.address || "").trim(), phone: String(req.body.phone || "").trim(), serviceVillages: Array.isArray(req.body.serviceVillages) ? req.body.serviceVillages.map((v) => String(v).trim()).filter(Boolean) : [], deliveryCharge: Math.max(0, Number(req.body.deliveryCharge) || 0), minimumOrder: Math.max(0, Number(req.body.minimumOrder) || 0), estimatedDelivery: String(req.body.estimatedDelivery || "").trim() };
    res.json(await DeliverySettings.findOneAndUpdate({ key: "store" }, settings, { upsert: true, new: true, runValidators: true }));
  } catch (error) { next(error); }
});

app.get("/api/admin/inventory", adminOnly, async (req, res, next) => {
  try { res.json(await InventoryTransaction.find().populate("product", "name unit").sort({ createdAt: -1 }).limit(100).lean()); } catch (error) { next(error); }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) });
app.post("/api/admin/images", adminOnly, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG or WebP image under 5 MB." });
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: "Image uploads are not configured. Add Cloudinary credentials on the server." });
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: "dk-raju-store", resource_type: "image" }, (error, value) => error ? reject(error) : resolve(value));
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ message: "This request was already received or the value already exists." });
  if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: "The submitted information is invalid." });
  console.error(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : "Something went wrong. Please try again." });
});

if (process.env.NODE_ENV !== "test") {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  mongoose.connect(process.env.MONGODB_URI)
    .then(seedAdmin)
    .then(() => app.listen(port, () => console.log(`API listening on port ${port}`)))
    .catch((error) => { console.error("Database startup failed:", error.message); process.exit(1); });
}

export default app;