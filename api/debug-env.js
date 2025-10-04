export default function handler(req, res) {
  // Get all environment variables that might be related to our app
  const relevantVars = Object.keys(process.env)
    .filter(key => 
      key.includes('VAPID') || 
      key.includes('MONGO') || 
      key.includes('EMAIL') ||
      key.includes('PUBLIC') ||
      key.includes('PRIVATE')
    )
    .reduce((obj, key) => {
      obj[key] = process.env[key] ? "Set" : "Not set";
      return obj;
    }, {});

  res.status(200).json({
    message: "Environment Variables Debug",
    timestamp: new Date().toISOString(),
    relevantVars,
    allEnvVarCount: Object.keys(process.env).length,
    firstFewEnvVars: Object.keys(process.env).slice(0, 10)
  });
}
