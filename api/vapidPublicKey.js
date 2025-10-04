export default function handler(req, res) {
  try {
    console.log('=== VAPID Key Debug Info ===');
    console.log('Available env vars:', Object.keys(process.env));
    console.log('PUBLIC_VAPID_KEY value:', process.env.PUBLIC_VAPID_KEY);
    console.log('PUBLIC_VAPID_KEY type:', typeof process.env.PUBLIC_VAPID_KEY);
    console.log('PUBLIC_VAPID_KEY length:', process.env.PUBLIC_VAPID_KEY ? process.env.PUBLIC_VAPID_KEY.length : 'N/A');
    
    // Check for common naming mistakes
    const possibleKeys = Object.keys(process.env).filter(key => 
      key.toLowerCase().includes('vapid') || 
      key.toLowerCase().includes('public')
    );
    console.log('Possible VAPID keys found:', possibleKeys);
    
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    
    if (!publicKey) {
      console.error('VAPID public key is not configured');
      return res.status(500).json({ 
        error: 'VAPID public key is not configured',
        message: 'Please set PUBLIC_VAPID_KEY in your environment variables',
        debug: {
          availableVars: Object.keys(process.env),
          possibleVapidKeys: possibleKeys
        }
      });
    }
    
    res.setHeader('Content-Type', 'text/plain');
    console.log('Successfully sending VAPID public key');
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
