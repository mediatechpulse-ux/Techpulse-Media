export default function handler(req, res) {
  try {
    // Debug logging
    console.log('VAPID Public Key Request Received');
    console.log('PUBLIC_VAPID_KEY value:', process.env.PUBLIC_VAPID_KEY);
    console.log('PUBLIC_VAPID_KEY type:', typeof process.env.PUBLIC_VAPID_KEY);
    
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
    console.log('Sending VAPID public key:', publicKey.substring(0, 20) + '...');
    return res.status(200).send(publicKey);
  } catch (error) {
    console.error('Error in vapidPublic endpoint:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
