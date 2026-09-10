page.route('**/api/orders', handler);
page.route('/api/orders', handler);
page.route('https://payments.example.com.evil.test/**', handler);
page.route(/payments/, handler);
page.routeFromHAR('orders.har');
const detached = page.route;
const { route: escapedRoute } = context;
page.routeFromHAR('orders.har', { url: 'https://payments.example.com/**', ...options });
page.routeWebSocket('ws://localhost:3000/**', handler);
