import mongoose from 'mongoose';

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

// Database connection
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    console.log('Using cached database connection');
    return cachedDb;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not defined');
  }

  console.log('Creating new database connection');
  
  try {
    const db = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    cachedDb = db;
    console.log('Database connected successfully');
    return db;
  } catch (err) {
    console.error('Database connection error:', err);
    throw new Error('Failed to connect to database');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Connect to database
    await connectToDatabase();
    
    // Get subscription from request body
    const subscription = req.body;
    
    // Validate subscription
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      console.error('Invalid subscription data:', subscription);
      return res.status(400).json({ message: 'Invalid subscription data' });
    }
    
    if (!subscription.keys.p256dh || !subscription.keys.auth) {
      console.error('Missing required keys in subscription:', subscription.keys);
      return res.status(400).json({ message: 'Missing required keys in subscription' });
    }
    
    // Check if subscription already exists
    const existingSubscription = await Subscription.findOne({ endpoint: subscription.endpoint });
    if (existingSubscription) {
      console.log('Subscription already exists for endpoint:', subscription.endpoint);
      return res.status(200).json({ message: 'Subscription already exists' });
    }
    
    // Create and save new subscription
    const newSubscription = new Subscription(subscription);
    await newSubscription.save();
    
    console.log('Subscription saved successfully for endpoint:', subscription.endpoint);
    res.status(201).json({ message: 'Subscription saved successfully' });
    
  } catch (err) {
    console.error('Subscription error:', err);
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to save subscription';
    let statusCode = 500;
    
    if (err.name === 'ValidationError') {
      errorMessage = 'Validation error: ' + err.message;
      statusCode = 400;
    } else if (err.name === 'MongoError' && err.code === 11000) {
      errorMessage = 'Duplicate subscription';
      statusCode = 409;
    } else if (err.message.includes('MONGO_URI')) {
      errorMessage = 'Database configuration error';
      statusCode = 503;
    } else if (err.message.includes('Failed to connect to database')) {
      errorMessage = 'Database connection failed';
      statusCode = 503;
    }
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
}
