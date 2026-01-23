# Vendora WebSocket Server

Real-time WebSocket server for Vendora POS synchronization across multiple devices.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env

# Start server
npm start

# Or for development with auto-reload
npm run dev
```

## Configuration

Edit `.env` file with your settings:

```env
PORT=3001
JWT_SECRET=<your-laravel-jwt-secret>
WEBHOOK_SECRET=<shared-secret-with-laravel>
```

**Important**: `JWT_SECRET` must match your Laravel JWT secret for authentication to work.

## Architecture

```
Laravel Backend ──webhook──> Node.js WebSocket Server ──socket.io──> Mobile Apps
```

1. Laravel triggers webhooks when data changes (products, orders, categories)
2. WebSocket server receives webhooks and broadcasts to connected clients
3. Mobile apps receive events and refresh their local data

## API Endpoints

### WebSocket
- `ws://localhost:3001` - Socket.io connection (requires JWT auth)

### REST
- `GET /` - Server info
- `GET /webhook/health` - Health check with connection stats
- `POST /webhook/events` - Receive events from Laravel (requires HMAC signature)
- `POST /webhook/batch` - Receive multiple events (requires HMAC signature)

## Event Types

| Event | Description |
|-------|-------------|
| `product:created` | New product added |
| `product:updated` | Product details changed |
| `product:deleted` | Product removed |
| `stock:updated` | Stock level changed |
| `order:created` | New order/sale completed |
| `order:updated` | Order status changed |
| `category:created` | New category added |
| `category:updated` | Category details changed |
| `category:deleted` | Category removed |

## Testing

### Test Health Endpoint
```bash
curl http://localhost:3001/webhook/health
```

### Test Webhook (generate signature first)
```bash
# Generate signature using your WEBHOOK_SECRET
PAYLOAD='{"event":"product:updated","data":{"id":1,"name":"Test Product"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your-webhook-secret" | cut -d' ' -f2)

# Send webhook
curl -X POST http://localhost:3001/webhook/events \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Test Socket Connection
Use a Socket.io test client with JWT token in auth:
```javascript
const socket = io('http://localhost:3001', {
  auth: { token: 'your-jwt-token' }
});
```

## Laravel Integration

See the Laravel webhook integration files:
- `app/Services/WebhookService.php` - Dispatches webhooks
- `app/Observers/ProductObserver.php` - Triggers product events
- `app/Observers/OrderObserver.php` - Triggers order events
- `app/Observers/CategoryObserver.php` - Triggers category events

## Production Deployment

### Option A: Same Server as Laravel
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start src/index.js --name vendora-websocket
pm2 save
```

### Option B: Separate Server
Deploy to Railway, Render, or any Node.js hosting:
1. Set environment variables
2. Ensure firewall allows inbound connections on port
3. Update Laravel `WEBSOCKET_SERVER_URL` to new server address

## Security Checklist

- [ ] Use strong, random `WEBHOOK_SECRET` (32+ characters)
- [ ] Ensure `JWT_SECRET` matches Laravel
- [ ] Use HTTPS/WSS in production
- [ ] Set appropriate CORS origins in production
- [ ] Consider rate limiting webhook endpoint
