export default function handler(req, res) {
  try {
    console.log('VAPID Public Key Request Received');
    
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    
    if (!publicKey) {
      console.error('VAPID public key is not configured in environment variables');
      return res.status(500).json({ 
        error: 'VAPID public key is not configured',
        message: 'Please set PUBLIC_VAPID_KEY in your environment variables'
      });
    }
    
    // Set proper content type header
    res.setHeader('Content-Type', 'text/plain');
    console.log('Sending VAPID public key');
    return res.status(200).send(publicKey);
  } catch (error) {
    console.error('Error in vapidPublic endpoint:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
