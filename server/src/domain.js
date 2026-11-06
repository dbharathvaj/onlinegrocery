import crypto from "node:crypto";

export function normalizeMobile(value) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

export function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value));
}

export function normalizeLocation(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-IN");
}

export function isServiceable(location, villages = []) {
  const requested = normalizeLocation(location);
  return requested.length > 0 && villages.some((village) => normalizeLocation(village) === requested);
}

export function calculateTotals(items, deliveryCharge = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { subtotal, deliveryCharge, total: subtotal + deliveryCharge };
}

export function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (![orderId, paymentId, signature, secret].every((value) => typeof value === "string" && value.length > 0)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}