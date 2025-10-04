export default function handler(req, res) {
  try {
    console.log('VAPID Public Key Request Received');
    console.log('All environment variables:', Object.keys(process.env));
    console.log('PUBLIC_VAPID_KEY value:', process.env.PUBLIC_VAPID_KEY);
    console.log('PUBLIC_VAPID_KEY type:', typeof process.env.PUBLIC_VAPID_KEY);
    
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    
    if (!publicKey) {
      console.error('VAPID public key is not configured');
      return res.status(500).json({ 
        error: 'VAPID public key is not configured',
        message: 'Please set PUBLIC_VAPID_KEY in your environment variables',
        envVars: Object.keys(process.env).filter(key => key.includes('VAPID'))
      });
    }
    
    res.setHeader('Content-Type', 'text/plain');
    console.log('Sending VAPID public key (first 20 chars):', publicKey.substring(0, 20));
    return res.status(200).send(publicKey);
  } catch (error) {
    console.error('Error in vapidPublic endpoint:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    });
  }
}
