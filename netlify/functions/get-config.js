exports.handler = async () => {
  const cfg = {
    apiKey:            process.env.FIREBASE_API_KEY            || "AIzaSyA5-NRXzzkWuGafQ5-EukGF9WMnQ2txFFA",
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || "shotbreak-9f342.firebaseapp.com",
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || "https://shotbreak-9f342-default-rtdb.firebaseio.com",
    projectId:         process.env.FIREBASE_PROJECT_ID         || "shotbreak-9f342",
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || "shotbreak-9f342.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "515766987392",
    appId:             process.env.FIREBASE_APP_ID             || "1:515766987392:web:ac3644d952c69d11c7d465",
    wavespeedApiKey:   process.env.WAVESPEED_API_KEY           || ""
  };
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(cfg)
  };
};
