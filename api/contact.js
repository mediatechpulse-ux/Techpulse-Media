import mongoose from "mongoose";
import nodemailer from "nodemailer";
import webpush from "web-push";
import crypto from "crypto";

// ===== SCHEMAS =====
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
const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

const subscriptionSchema = new mongoose.Schema({
  endpoint: String,
  keys: {
    p256dh: String,
    auth: String
  },
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);

// ===== SPAM PROTECTION MODELS =====
const rateLimitSchema = new mongoose.Schema({
  ip: String,
  timestamp: { type: Date, default: Date.now, expires: '1h' } // Auto-expire after 1 hour
});
const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);

const blacklistSchema = new mongoose.Schema({
  ip: String,
  email: String,
  reason: String,
  timestamp: { type: Date, default: Date.now }
});
const Blacklist = mongoose.models.Blacklist || mongoose.model('Blacklist', blacklistSchema);

// ===== CONFIGURATION =====
const disposableEmailDomains = [
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'throwaway.email', 'sharklasers.com', 'tempmail.org',
  'yopmail.com', 'maildrop.cc', 'temp-mail.org',
  'dispostable.com', 'getnada.com', 'instantemailaddress.com',
  'spamgourmet.com', 'trashmail.com', 'fakeinbox.com'
];

const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_SUBMISSIONS_PER_WINDOW = 5;

// ===== HELPER FUNCTIONS =====
function getRealIP(req) {
  return (
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validateEmailDomain(email) {
  if (!email?.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  return !disposableEmailDomains.includes(domain);
}

function analyzeContent(content) {
  const spamKeywords = [
    'viagra', 'casino', 'lottery', 'winner', 'free money',
    'click here', 'limited time', 'act now', 'congratulations',
    'urgent', 'offer', 'discount', 'deal', 'promotion', 'loan',
    'sex', 'xxx', 'nude', 'buy now', 'no credit check'
  ];

  const lower = content.toLowerCase();
  const hasSpamKeywords = spamKeywords.some(kw => lower.includes(kw));
  const linkCount = (lower.match(/https?:\/\//g) || []).length;
  const hasExcessiveLinks = linkCount > 2;
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  const hasExcessiveCaps = capsRatio > 0.6;

  return hasSpamKeywords || hasExcessiveLinks || hasExcessiveCaps;
}

async function checkRateLimit(ip) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW);
  const count = await RateLimit.countDocuments({
    ip,
    timestamp: { $gte: windowStart }
  });
  return count >= MAX_SUBMISSIONS_PER_WINDOW;
}

async function checkBlacklist(ip, email) {
  return await Blacklist.findOne({ $or: [{ ip }, { email }] });
}

// ===== DATABASE CONNECTION =====
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing');
  }

  const db = await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  cachedDb = db;
  return db;
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Validate environment
  const required = ['MONGO_URI', 'EMAIL_USER', 'EMAIL_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing);
    return res.status(500).json({
      message: 'Server configuration error',
      ...(process.env.NODE_ENV === 'development' && { missing })
    });
  }

  try {
    await connectToDatabase();

    const ip = getRealIP(req);
    const { name, email, service, budget, deadline, message } = req.body;

    // === VALIDATION ===
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email, and message are required' });
    }

    // Check blacklist
    if (await checkBlacklist(ip, email)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Rate limit
    if (await checkRateLimit(ip)) {
      return res.status(429).json({ message: 'Too many requests. Try again later.' });
    }

    // Email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Disposable email
    if (!validateEmailDomain(email)) {
      await Blacklist.create({ ip, email, reason: 'Disposable email' });
      return res.status(400).json({ message: 'Disposable email addresses are not allowed' });
    }

    // Spam content
    if (analyzeContent(message)) {
      await Blacklist.create({ ip, email, reason: 'Spam content detected' });
      return res.status(400).json({ message: 'Message flagged as spam' });
    }

    // Record submission for rate limiting
    await RateLimit.create({ ip });

    // === SAVE CONTACT ===
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const contact = new Contact({
      name,
      email,
      service,
      budget,
      deadline,
      message,
      verified: false,
      verifyToken
    });
    await contact.save();

    // === EMAIL SETUP ===
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // Avoid cert issues in serverless
      }
    });

    // Optional: Verify transporter (not always needed in production)
    // await new Promise((resolve, reject) => {
    //   transporter.verify((err, success) => err ? reject(err) : resolve(success));
    // });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/verify?token=${verifyToken}`;

    // Email to admin
    await transporter.sendMail({
      from: `"TechPulse Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: '📩 New Contact Form Submission',
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Service:</strong> ${service || 'N/A'}</p>
        <p><strong>Budget:</strong> ${budget || 'N/A'}</p>
        <p><strong>Deadline:</strong> ${deadline || 'N/A'}</p>
        <p><strong>Message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
        <p><em>Status: Awaiting email verification</em></p>
      `
    });

    // Verification email to user
    await transporter.sendMail({
      from: `"TechPulse Media" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Please Verify Your Email',
      html: `
        <h2>Hello ${name},</h2>
        <p>Thank you for contacting us! Please verify your email to confirm your inquiry:</p>
        <p>
          <a href="${verificationLink}" 
             style="display:inline-block; background:#f26e1d; color:white; padding:12px 24px; text-decoration:none; border-radius:4px;">
            ✅ Verify Email
          </a>
        </p>
        <p>If you didn’t submit this form, please ignore this email.</p>
        <p>Best regards,<br>TechPulse Media Team</p>
      `
    });

    // === PUSH NOTIFICATIONS (optional) ===
    if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
      try {
        webpush.setVapidDetails(
          `mailto:${process.env.EMAIL_USER}`,
          process.env.PUBLIC_VAPID_KEY,
          process.env.PRIVATE_VAPID_KEY
        );

        const payload = JSON.stringify({
          title: 'New Contact Form',
          body: `From: ${name} (${email})`,
          icon: '/favicon.ico'
        });

        const subs = await Subscription.find();
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub, payload);
          } catch (err) {
            if (err.statusCode === 410) {
              await Subscription.findByIdAndDelete(sub._id);
            }
          }
        }
      } catch (pushErr) {
        console.warn('Push notification failed (non-fatal):', pushErr.message);
      }
    }

    return res.status(200).json({
      message: 'Form submitted! Please check your email to verify your address.'
    });

  } catch (err) {
    console.error('🚨 Contact API Error:', err);

    // Determine error type
    let msg = 'Internal server error';
    let status = 500;

    if (err.message?.includes('MONGO_URI')) {
      msg = 'Database configuration error';
    } else if (err.code === 'EAUTH') {
      msg = 'Email authentication failed (check app password)';
    } else if (err.name === 'ValidationError') {
      msg = 'Invalid form data';
      status = 400;
    } else if (err.name === 'MongoError' && err.message.includes('connect')) {
      msg = 'Database connection failed';
    } else if (err.message?.includes('Disposable email')) {
      msg = 'Disposable email not allowed';
      status = 400;
    }

    return res.status(status).json({
      message: msg,
      ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
  }
}
