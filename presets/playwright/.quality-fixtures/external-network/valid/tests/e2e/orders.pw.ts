page.route('https://payments.example.com/**', handler);
context.route('https://payments.example.com/v1/*', handler);
page.routeFromHAR('payments.har', { url: 'https://payments.example.com/**' });
page.routeWebSocket('wss://payments.example.com/**', handler);
