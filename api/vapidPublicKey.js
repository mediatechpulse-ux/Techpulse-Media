export default function handler(req, res) {
  const publicKey = process.env.PUBLIC_VAPID_KEY;
  if (!publicKey) {
    return res.status(500).send('VAPID public key is not configured');
  }
  res.send(publicKey);
}
