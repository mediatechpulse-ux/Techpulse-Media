const mongoose = require("mongoose");

// MongoDB connection
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts)
      .then(mongoose => {
        return mongoose;
      });
  }
  
  cached.conn = await cached.promise;
  return cached.conn;
}

// Contact schema
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDB();
    const { token } = req.query;
    
    if (!token) {
      return res.redirect("/verify-error.html");
    }

    const contact = await Contact.findOne({ verifyToken: token });
    if (!contact) {
      return res.redirect("/verify-error.html");
    }

    contact.verified = true;
    contact.verifyToken = null;
    await contact.save();

    return res.redirect("/verified.html");
  } catch (err) {
    console.error("Verification error:", err);
    return res.redirect("/verify-error.html");
  }
}
