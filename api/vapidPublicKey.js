export default function handler(req, res) {
  try {
    // Hardcoded VAPID public key - temporary solution
    const publicKey = "BKqH1Qt3sEj1fefqCt7wQZBO0qRFn8eMQTw4msq18yY-1W7gap-4QKj879R3c_JtMeKqVieeHaqx5gDa3Ujvtys";
    
    console.log('VAPID Public Key Request - using hardcoded key');
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(publicKey);
  } catch (error) {
    console.error('Error in vapidPublic endpoint:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
}
