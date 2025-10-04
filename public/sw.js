self.addEventListener('push', function(event) {
  let data = {};
  try { 
    data = event.data.json(); 
  } catch(e) { 
    console.error('Error parsing push data:', e);
    data = { 
      title: 'New Notification', 
      body: 'You have a new message' 
    }; 
  }
  
  const title = data.title || 'TechPulse Media';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/Assets/logo.png',
    badge: '/Assets/logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(clientList => {
        // If a client is already open, focus it
        for (let client of clientList) {
          if (client.url.includes('localhost:3000') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url || '/');
        }
      })
  );
});

// Install event
self.addEventListener('install', function(event) {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', function(event) {
  console.log('Service Worker activating...');
  return self.clients.claim();
});
