import mongoose from "mongoose";
import nodemailer from "nodemailer";
import webpush from "web-push";

// Configure VAPID keys
webpush.setVapidDetails(
  "mailto:anamtabatool611@gmail.com",
  process.env.PUBLIC_VAPID_KEY,
  process.env.PRIVATE_VAPID_KEY
);

// Define schemas
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  service: String,
  budget: String,
  deadline: String,
  message: String,
  verified: { type: Boolean, default: false },
  verifyToken: String,
  createdAt: { type: Date, default: Date.now }
});

const subscriptionSchema = new mongoose.Schema({
  endpoint: String,
  keys: {
    p256dh: String,
    auth: String
  },
  createdAt: { type: Date, default: Date.now }
});

// Models
const Contact =
  mongoose.models.Contact || mongoose.model("Contact", contactSchema);
const Subscription =
  mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema);

// Cached DB connection
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, { bufferCommands: false })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ✅ Vercel handler
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!process.env.MONGO_URI) {
      return res.status(500).json({ error: "Database configuration missing" });
    }

    await connectDB();

    const { name, email, service, budget, deadline, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const contact = new Contact({ name, email, service, budget, deadline, message });
    await contact.save();

    // email + push notification code stays same...
    return res.status(200).json({
      success: true,
      message: "Contact form submitted successfully"
    });
  } catch (error) {
    console.error("Contact form error:", error);
    return res.status(500).json({
      error: "Failed to submit form",
      details: error.message
    });
  }
}
