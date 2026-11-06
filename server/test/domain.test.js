import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { calculateTotals, isServiceable, isValidMobile, normalizeMobile, verifyRazorpaySignature } from "../src/domain.js";

test("mobile validation accepts Indian mobile numbers with country prefix", () => {
  assert.equal(normalizeMobile("+91 98765 43210"), "9876543210");
  assert.equal(isValidMobile("9876543210"), true);
  assert.equal(isValidMobile("1234567890"), false);
});

test("service locations compare without case or surrounding whitespace", () => {
  assert.equal(isServiceable("  My Village ", ["my village"]), true);
  assert.equal(isServiceable("Other Village", ["my village"]), false);
});

test("totals use server-side item prices and configured delivery charge", () => {
  assert.deepEqual(calculateTotals([{ price: 25, quantity: 2 }, { price: 60, quantity: 1 }], 10), { subtotal: 110, deliveryCharge: 10, total: 120 });
});

test("Razorpay signatures are verified against the gateway order and payment ids", () => {
  const secret = "test-secret-not-a-credential";
  const signature = crypto.createHmac("sha256", secret).update("order_123|pay_456").digest("hex");
  assert.equal(verifyRazorpaySignature("order_123", "pay_456", signature, secret), true);
  assert.equal(verifyRazorpaySignature("order_123", "pay_other", signature, secret), false);
  assert.equal(verifyRazorpaySignature("order_123", "pay_456", "invalid", secret), false);
});