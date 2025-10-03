import mongoose from 'mongoose';

// Connect to MongoDB
let connectionPromise = null;
const getDbConnection = () => {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI);
  }
  return connectionPromise;
};

// Define schema
const subscriptionSchema = new mongoose.Schema({
  endpoint: String, 
  keys: { 
    p256dh: String, 
    auth: String 
  },
  createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await getDbConnection();
    const subscription = new Subscription(req.body);
    await subscription.save();
    res.status(201).json({ message: 'Subscribed successfully!' });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ message: 'Failed to save subscription' });
  }
}