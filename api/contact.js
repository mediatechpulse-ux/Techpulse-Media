import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import webpush from 'web-push';

// Connect to MongoDB
let connectionPromise = null;
const getDbConnection = () => {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI);
  }
  return connectionPromise;
};

// Define schemas
const contactSchema = new mongoose.Schema({
  name: String, 
  email: String, 
  service: String, 
  budget: String, 
  deadline: String, 
  message: String,
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

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Web Push setup
if (process.env.PUBLIC_VAPID_KEY && process.env.PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(
    'mailto:' + process.env.EMAIL_USER,
    process.env.PUBLIC_VAPID_KEY,
    process.env.PRIVATE_VAPID_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Connect to database
    await getDbConnection();

    const { name, email, service, budget, deadline, message } = req.body;

    // Save to database
    const newContact = new Contact({ name, email, service, budget, deadline, message });
    await newContact.save();

    // Send email
    const mailOptions = {
      from: `"TechPulse Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission',
      html: `<h3>New Contact Form Submission</h3>
             <p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Service:</strong> ${service}</p>
             <p><strong>Budget:</strong> ${budget}</p>
             <p><strong>Deadline:</strong> ${deadline}</p>
             <p><strong>Message:</strong><br>${message}</p>`
    };

    await transporter.sendMail(mailOptions);

    // Send push notifications
    const payload = JSON.stringify({
      title: 'New Contact Form Submission',
      body: `From: ${name} (${email})`
    });

    const subscriptions = await Subscription.find();
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        if (err.statusCode === 410) {
          await Subscription.findByIdAndDelete(subscription._id);
        }
      }
    }

    res.status(200).json({ message: 'Form submitted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}