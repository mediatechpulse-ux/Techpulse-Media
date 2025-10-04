import mongoose from "mongoose";
import nodemailer from "nodemailer";
import webpush from "web-push";
import crypto from "crypto";

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
const Contact = mongoose.model('Contact', contactSchema);

const subscriptionSchema = new mongoose.Schema({
  endpoint: String, 
  keys: { 
    p256dh: String, 
    auth: String 
  },
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', subscriptionSchema);

// ===== SPAM PROTECTION ADDITIONS START HERE =====

// Define RateLimit schema
const rateLimitSchema = new mongoose.Schema({
  ip: String,
  timestamp: { type: Date, default: Date.now, expires: 3600 } // Auto-delete after 1 hour
});
const RateLimit = mongoose.model('RateLimit', rateLimitSchema);

// Define Blacklist schema
const blacklistSchema = new mongoose.Schema({
  ip: String,
  email: String,
  reason: String,
  timestamp: { type: Date, default: Date.now }
});
const Blacklist = mongoose.model('Blacklist', blacklistSchema);

// List of disposable email domains
const disposableEmailDomains = [
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'throwaway.email', 'sharklasers.com', 'tempmail.org',
  'yopmail.com', 'maildrop.cc', 'temp-mail.org',
  'dispostable.com', 'getnada.com', 'instantemailaddress.com'
];

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_SUBMISSIONS_PER_WINDOW = 5;

// Rate limiting check
async function checkRateLimit(ip) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW);
  
  // Count submissions from this IP in the time window
  const count = await RateLimit.countDocuments({
    ip,
    timestamp: { $gte: windowStart }
  });
  
  // Return true if rate limited
  return count >= MAX_SUBMISSIONS_PER_WINDOW;
}

// Blacklist check
async function checkBlacklist(ip, email) {
  // Check if IP or email is blacklisted
  const isBlacklisted = await Blacklist.findOne({
    $or: [
      { ip },
      { email }
    ]
  });
  
  return !!isBlacklisted; // Return true if blacklisted
}

// Email validation
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Email domain validation
function validateEmailDomain(email) {
  if (!email || !email.includes('@')) return false;
  
  const domain = email.split('@')[1].toLowerCase();
  return !disposableEmailDomains.includes(domain);
}

// Content analysis
function analyzeContent(content) {
  // List of spam keywords
  const spamKeywords = [
    'viagra', 'casino', 'lottery', 'winner', 'free money',
    'click here', 'limited time', 'act now', 'congratulations',
    'urgent', 'offer', 'discount', 'deal', 'promotion'
  ];
  
  const lowerContent = content.toLowerCase();
  
  // Check for spam keywords
  const hasSpamKeywords = spamKeywords.some(keyword => lowerContent.includes(keyword));
  
  // Check for excessive links (more than 2)
  const linkRegex = /https?:\/\/[^\s]+/g;
  const links = lowerContent.match(linkRegex) || [];
  const hasExcessiveLinks = links.length > 2;
  
  // Check for excessive capitalization (more than 50% caps)
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  const hasExcessiveCaps = capsRatio > 0.5;
  
  return hasSpamKeywords || hasExcessiveLinks || hasExcessiveCaps;
}

// ===== SPAM PROTECTION ADDITIONS END HERE =====

// Database connection
let cachedDb = null;

async function connectToDatabase() {
  // Check if we have a cached connection
  if (cachedDb) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  // Check if MONGO_URI is defined
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not defined');
  }

  console.log('Creating new database connection');
  
  // Connect to our MongoDB database
  const db = await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  });

  cachedDb = db;
  console.log('Database connected successfully');
  return db;
}

// Main handler function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Check required environment variables
    const requiredEnvVars = ['MONGO_URI', 'EMAIL_USER', 'EMAIL_PASSWORD'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missingEnvVars.length > 0) {
      console.error('Missing environment variables:', missingEnvVars);
      return res.status(500).json({ 
        message: 'Server configuration error', 
        missing: missingEnvVars 
      });
    }

    // Connect to database
    await connectToDatabase();

    // ===== SPAM PROTECTION INTEGRATION STARTS HERE =====
    
    // Get client IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    const { name, email, service, budget, deadline, message } = req.body;
    
    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Check blacklist
    const isBlacklisted = await checkBlacklist(ip, email);
    if (isBlacklisted) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check rate limit
    const isRateLimited = await checkRateLimit(ip);
    if (isRateLimited) {
      return res.status(429).json({ message: 'Too many requests' });
    }
    
    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Validate email domain
    if (!validateEmailDomain(email)) {
      return res.status(400).json({ message: 'Disposable email domains are not allowed' });
    }
    
    // Content analysis
    if (analyzeContent(message)) {
      // Add to blacklist
      await Blacklist.create({
        ip,
        email,
        reason: 'Spam content',
        timestamp: new Date()
      });
      
      return res.status(400).json({ message: 'Your message was flagged as spam' });
    }
    
    // If all checks pass, record the submission for rate limiting
    await RateLimit.create({
      ip,
      timestamp: new Date()
    });
    
    // ===== SPAM PROTECTION INTEGRATION ENDS HERE =====

    // Generate verification token
    const verifyToken = crypto.randomBytes(20).toString('hex');
    
    // Save to database with verification token
    const newContact = new Contact({ 
      name, 
      email, 
      service, 
      budget, 
      deadline, 
      message,
      verified: false,
      verifyToken
    });
    await newContact.save();

    // Create email transporter
  const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});


    // Verify transporter configuration
    await new Promise((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          console.error('Email transporter verification failed:', error);
          reject(error);
        } else {
          console.log('Email transporter is ready');
          resolve(success);
        }
      });
    });

    // Send email to site owner
    const ownerMailOptions = {
      from: `"TechPulse Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission',
      html: `<h3>New Contact Form Submission</h3>
             <p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Service:</strong> ${service}</p>
             <p><strong>Budget:</strong> ${budget}</p>
             <p><strong>Deadline:</strong> ${deadline}</p>
             <p><strong>Message:</strong><br>${message}</p>
             <p><strong>Status:</strong> Awaiting email verification</p>`
    };

    await transporter.sendMail(ownerMailOptions);
    console.log('Owner notification sent');

    // Send verification email to user
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verificationLink = `${baseUrl}/verify?token=${verifyToken}`;
    
    const userMailOptions = {
      from: `"TechPulse Media" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email Address',
      html: `<h2>Hello ${name},</h2>
             <p>Thank you for contacting TechPulse Media. Please verify your email address by clicking the link below:</p>
             <p><a href="${verificationLink}" style="background-color: #f26e1d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
             <p>If you didn't request this, please ignore this email.</p>
             <p>Best regards,<br>TechPulse Media Team</p>`
    };

    await transporter.sendMail(userMailOptions);
    console.log('User verification email sent');

    // Send push notifications (if VAPID keys are configured)
    if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
      try {
        webpush.setVapidDetails(
          'mailto:' + process.env.EMAIL_USER,
          process.env.PUBLIC_VAPID_KEY,
          process.env.PRIVATE_VAPID_KEY
        );
        
        const payload = JSON.stringify({
          title: 'New Contact Form Submission',
          body: `From: ${name} (${email})`
        });

        const subscriptions = await Subscription.find();
        console.log(`Found ${subscriptions.length} push subscriptions`);
        
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification(subscription, payload);
            console.log('Push notification sent successfully');
          } catch (err) {
            console.error('Error sending push notification:', err);
            if (err.statusCode === 410) {
              console.log('Subscription expired, removing from database');
              await Subscription.findByIdAndDelete(subscription._id);
            }
          }
        }
      } catch (err) {
        console.error('Push notification error:', err);
        // Don't fail the whole request if push notifications fail
      }
    } else {
      console.log('VAPID keys not configured, skipping push notifications');
    }

    res.status(200).json({ 
      message: 'Form submitted successfully! Please check your email to verify your address.' 
    });
  } catch (err) {
    console.error('Contact form error:', err);
    
    // Provide more specific error message based on the error type
    let errorMessage = 'Server error';
    let statusCode = 500;
    
    if (err.name === 'MongoError') {
      errorMessage = 'Database error';
      if (err.message.includes('connection')) {
        errorMessage = 'Database connection error';
      }
    } else if (err.name === 'ValidationError') {
      errorMessage = 'Validation error: ' + err.message;
      statusCode = 400;
    } else if (err.code === 'EAUTH') {
      errorMessage = 'Email authentication error';
    } else if (err.code === 'ESOCKET') {
      errorMessage = 'Email connection error';
    } else if (err.message.includes('VAPID')) {
      errorMessage = 'Push notification configuration error';
    } else if (err.message.includes('ENOENT')) {
      errorMessage = 'File or directory not found';
    } else if (err.message.includes('MONGO_URI')) {
      errorMessage = 'Database configuration error: MONGO_URI is not defined';
    }
    
    res.status(statusCode).json({ 
      message: errorMessage, 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
}


