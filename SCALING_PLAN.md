# Vendora WebSocket Server & Laravel Backend Scaling Plan

> **Document Version:** 1.1
> **Date:** January 2026
> **Scope:** Both `vendora-websocket-server` and `vendora-backend-rest-api`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Hosting Setup](#current-hosting-setup)
3. [Deployment Options](#deployment-options)
4. [Current Architecture Analysis](#current-architecture-analysis)
5. [Identified Bottlenecks](#identified-bottlenecks)
6. [Proposed Architecture](#proposed-architecture)
7. [Implementation Phases](#implementation-phases)
8. [File Changes Reference](#file-changes-reference)
9. [Configuration Changes](#configuration-changes)
10. [Capacity Estimates](#capacity-estimates)
11. [Rollback Plan](#rollback-plan)
12. [Testing Strategy](#testing-strategy)

---

## Executive Summary

This document outlines a scaling strategy to prepare the Vendora real-time infrastructure for increased user load. The plan addresses bottlenecks in both the **Laravel backend** (webhook dispatch) and **Node.js WebSocket server** (connection handling).

### Key Changes Overview

| System | Current State | Target State |
|--------|---------------|--------------|
| Laravel Queue | Database (sync) | Redis (async) |
| Laravel Cache | Database | Redis |
| Webhook Dispatch | Synchronous HTTP | Queued Jobs |
| WebSocket Clustering | Single instance | Multi-instance with Redis adapter |
| Token Validation | Per-connection API call | Redis-cached tokens |

### Expected Outcome

- **10x improvement** in API response times (removing blocking webhook calls)
- **20x increase** in concurrent WebSocket connections
- **Zero data loss** during WebSocket server restarts
- **Horizontal scaling** capability for future growth

---

## Current Hosting Setup

### Production Environment

| Service | Domain | Hosting |
|---------|--------|---------|
| Laravel API | `vendora-api.abedubas.dev` | Hostinger Business (Shared) |
| WebSocket Server | `vendora-ws.abedubas.dev` | Hostinger Business (Shared) |
| Main Website | `abedubas.dev` | Hostinger Business (Shared) |

### Hostinger Business Limitations

Since Hostinger Business is **shared hosting**, the following restrictions apply:

| Feature | Available? | Impact |
|---------|------------|--------|
| Install Redis | ❌ No | Cannot self-host Redis |
| Root/SSH Access | ❌ Limited | Cannot install system packages |
| Persistent Processes | ⚠️ Limited | Node.js may have restrictions |
| PM2 Cluster Mode | ❌ No | Cannot use multi-core clustering |
| Custom Ports | ❌ No | Must use provided ports |

---

## Deployment Options

Choose one of the following deployment strategies based on your needs:

### Option A: Shared Hosting + Upstash (Current Setup - Easiest)

**Best for:** Starting out, low-medium traffic, minimal maintenance

```
┌────────────────────────────────────────────────────────────────┐
│                    Hostinger Business                          │
│  ┌─────────────────────┐    ┌─────────────────────┐           │
│  │  vendora-api        │    │  vendora-ws         │           │
│  │  (Laravel)          │    │  (Node.js)          │           │
│  └──────────┬──────────┘    └──────────┬──────────┘           │
└─────────────┼──────────────────────────┼──────────────────────┘
              │                          │
              │      ┌───────────────────┴───────────┐
              │      │                               │
              ▼      ▼                               ▼
       ┌─────────────────┐                  ┌──────────────┐
       │     Upstash     │                  │    MySQL     │
       │  (Managed Redis)│                  │  (Hostinger) │
       │      FREE       │                  └──────────────┘
       └─────────────────┘
```

**Pros:**
- ✅ No server management
- ✅ Free Redis (Upstash free tier: 10K commands/day)
- ✅ Easy setup
- ✅ No additional monthly cost

**Cons:**
- ❌ Limited to Upstash free tier limits
- ❌ Cannot use PM2 cluster mode
- ❌ Shared hosting restrictions apply
- ❌ May have WebSocket connection limits

**Estimated Capacity:** ~500-1,000 concurrent users

---

### Option B: Hybrid - Laravel on Hostinger + WebSocket on VPS (Recommended)

**Best for:** Growing applications, 500+ concurrent users, production workloads

```
┌────────────────────────────────────────┐
│        Hostinger Business              │
│  ┌──────────────────────────────────┐  │
│  │  vendora-api.abedubas.dev        │  │
│  │  (Laravel API)                   │  │
│  └───────────────┬──────────────────┘  │
└──────────────────┼─────────────────────┘
                   │ webhooks
                   ▼
┌────────────────────────────────────────┐
│         VPS ($4-6/month)               │
│  vendora-ws.abedubas.dev              │
├────────────────────────────────────────┤
│                                        │
│  ┌─────────────┐    ┌─────────────┐   │
│  │   Node.js   │    │    Redis    │   │
│  │  WebSocket  │◄──►│   (local)   │   │
│  │   + PM2     │    │    FREE     │   │
│  └─────────────┘    └─────────────┘   │
│                                        │
└────────────────────────────────────────┘
```

**Pros:**
- ✅ Full control over WebSocket server
- ✅ PM2 cluster mode (use all CPU cores)
- ✅ Self-hosted Redis (free, no limits)
- ✅ Better WebSocket performance
- ✅ Horizontal scaling possible
- ✅ No shared hosting restrictions for real-time features

**Cons:**
- ❌ Additional cost (~$4-6/month for VPS)
- ❌ Need to manage VPS server
- ❌ Need to configure firewall/security

**Estimated Capacity:** ~5,000-20,000 concurrent users

**Recommended VPS Providers:**

| Provider | RAM | CPU | Cost | Notes |
|----------|-----|-----|------|-------|
| **Hostinger VPS** | 1GB | 1 | $4.99/mo | Same provider, easy DNS |
| **DigitalOcean** | 1GB | 1 | $6/mo | Great documentation |
| **Vultr** | 1GB | 1 | $5/mo | Good performance |
| **Hetzner** | 2GB | 2 | €3.79/mo | Best value (EU) |
| **Contabo** | 4GB | 2 | $5.50/mo | Most RAM for price |

---

### Option C: Full VPS (Maximum Control)

**Best for:** Large scale, full control, enterprise deployments

```
┌─────────────────────────────────────────────────────────────┐
│                    VPS Server                                │
│  vendora-api.abedubas.dev + vendora-ws.abedubas.dev        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
│  │  Nginx    │  │  Laravel  │  │  Node.js  │  │  Redis  │ │
│  │  Proxy    │  │   + PHP   │  │ WebSocket │  │  local  │ │
│  └───────────┘  └───────────┘  └───────────┘  └─────────┘ │
│                                                             │
│                       ┌─────────┐                          │
│                       │  MySQL  │                          │
│                       └─────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Maximum control
- ✅ All services on one server (low latency)
- ✅ Single point of management
- ✅ Can scale vertically (upgrade VPS)

**Cons:**
- ❌ Higher cost (~$12-20/month for adequate specs)
- ❌ More complex setup
- ❌ Single point of failure
- ❌ Need to manage everything

**Estimated Capacity:** ~10,000-50,000 concurrent users (depends on VPS specs)

---

### Deployment Option Comparison

| Aspect | Option A (Upstash) | Option B (Hybrid) | Option C (Full VPS) |
|--------|-------------------|-------------------|---------------------|
| **Monthly Cost** | $0 | $4-6 | $12-20 |
| **Setup Complexity** | Easy | Medium | Hard |
| **Maintenance** | Low | Medium | High |
| **Scalability** | Limited | Good | Excellent |
| **WebSocket Performance** | Limited | Excellent | Excellent |
| **PM2 Clustering** | ❌ | ✅ | ✅ |
| **Self-hosted Redis** | ❌ | ✅ | ✅ |
| **Concurrent Users** | ~1,000 | ~20,000 | ~50,000+ |
| **Recommended For** | Starting out | Growing apps | Enterprise |

---

## Current Architecture Analysis

### System Diagram (Current)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CURRENT ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │  Mobile App  │         │  Mobile App  │         │  Mobile App  │
    │  (Client 1)  │         │  (Client 2)  │         │  (Client N)  │
    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
           │                        │                        │
           │ HTTP/REST              │ WebSocket              │
           ▼                        ▼                        ▼
    ┌──────────────┐         ┌─────────────────────────────────────┐
    │   Laravel    │         │      Node.js WebSocket Server       │
    │   Backend    │────────►│         (Single Instance)           │
    │  (REST API)  │  sync   │                                     │
    └──────┬───────┘  HTTP   └─────────────────────────────────────┘
           │                        │
           │                        │ Token validation
           ▼                        │ (every connection)
    ┌──────────────┐                │
    │    MySQL     │◄───────────────┘
    │   Database   │
    └──────────────┘
```

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Backend API | Laravel | 12.x |
| Authentication | Sanctum | 4.x |
| WebSocket Server | Node.js + Socket.IO | 4.7.x |
| Database | MySQL | 8.x |
| Queue Driver | Database | - |
| Cache Driver | Database | - |

### Request Flow (Current)

1. **API Request with Side Effects:**
   ```
   Client Request
        │
        ▼
   Laravel Controller
        │
        ▼
   Database Write (Product/Order/Category)
        │
        ▼
   Eloquent Observer Fires
        │
        ▼
   WebhookService->send()  ◄─── BLOCKING HTTP CALL (5s timeout)
        │
        ▼
   WebSocket Server receives webhook
        │
        ▼
   Broadcast to clients
        │
        ▼
   Return response to original client  ◄─── DELAYED BY WEBHOOK
   ```

2. **WebSocket Connection:**
   ```
   Client connects with token
        │
        ▼
   Socket.IO middleware
        │
        ▼
   HTTP call to Laravel /api/auth/me  ◄─── BLOCKING (every connection)
        │
        ▼
   Validate token, return user data
        │
        ▼
   Attach user to socket, join rooms
   ```

---

## Identified Bottlenecks

### Critical Issues

| Priority | Issue | Impact | Location |
|----------|-------|--------|----------|
| 🔴 P0 | Synchronous webhook dispatch | API requests blocked up to 5s | Laravel Observers |
| 🔴 P0 | Single WebSocket instance | Cannot scale horizontally | WebSocket Server |
| 🟠 P1 | Token validation per connection | Laravel overloaded with auth requests | WebSocket auth.js |
| 🟠 P1 | Database queue driver | Limited job throughput | Laravel config |
| 🟡 P2 | No rate limiting on webhooks | Vulnerable to abuse | WebSocket routes |
| 🟡 P2 | No message persistence | Missed events during downtime | WebSocket Server |

### Bottleneck Details

#### 1. Synchronous Webhook Dispatch (P0)

**Location:** `app/Observers/ProductObserver.php`, `OrderObserver.php`, `CategoryObserver.php`

**Problem:** The `WebhookService->send()` method makes a synchronous HTTP call to the WebSocket server. If the WebSocket server is slow or unresponsive, the entire API request is blocked.

```php
// Current code in ProductObserver.php
public function created(Product $product): void
{
    $this->webhookService->send('product:created', $product->toArray());
    // ↑ This blocks until WebSocket server responds or times out (5s)
}
```

**Impact:**
- API response times increase by 100-500ms per webhook
- If WebSocket server is down, API requests timeout after 5 seconds
- User experience degrades under load

#### 2. Single WebSocket Instance (P0)

**Location:** `vendora-websocket-server/src/socket/index.js`

**Problem:** Socket.IO is configured without a Redis adapter, meaning:
- All connections must go to a single server
- Cannot load balance across multiple instances
- Server restart = all clients disconnected

**Impact:**
- Maximum ~500-1000 concurrent connections per server
- Single point of failure
- Cannot scale horizontally

#### 3. Token Validation Per Connection (P1)

**Location:** `vendora-websocket-server/src/socket/auth.js`

**Problem:** Every new WebSocket connection triggers an HTTP call to Laravel's `/api/auth/me` endpoint.

```javascript
// Current code in auth.js
const response = await fetch(`${LARAVEL_API_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
});
// ↑ Called for EVERY new connection
```

**Impact:**
- 1000 connections = 1000 HTTP requests to Laravel
- Reconnection storms (e.g., after server restart) overwhelm Laravel
- Adds 50-200ms latency to connection establishment

#### 4. Database Queue Driver (P1)

**Location:** `vendora-backend-rest-api/.env`

**Problem:** Queue jobs stored in MySQL database table, which has limited throughput and adds database load.

**Impact:**
- Job processing limited to ~100-500 jobs/second
- Database becomes bottleneck under high load
- No real-time job monitoring

---

## Proposed Architecture

### System Diagram (Target)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TARGET ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │  Mobile App  │         │  Mobile App  │         │  Mobile App  │
    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
           │                        │                        │
           │                        │                        │
           ▼                        ▼                        ▼
    ┌──────────────┐         ┌─────────────────────────────────────┐
    │   Laravel    │         │          Load Balancer              │
    │   Backend    │         │       (Sticky Sessions)             │
    └──────┬───────┘         └─────────────┬───────────────────────┘
           │                               │
           │                    ┌──────────┼──────────┐
           │                    │          │          │
           │              ┌─────▼────┐ ┌───▼────┐ ┌───▼────┐
           │              │  WS #1   │ │ WS #2  │ │ WS #N  │
           │              │ (Node)   │ │ (Node) │ │ (Node) │
           │              └─────┬────┘ └───┬────┘ └───┬────┘
           │                    │          │          │
           │                    └──────────┼──────────┘
           │                               │
           ▼                               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                          REDIS                               │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
    │  │   Queue     │  │   Cache     │  │   Pub/Sub   │          │
    │  │  (Jobs)     │  │  (Tokens)   │  │  (Socket)   │          │
    │  └─────────────┘  └─────────────┘  └─────────────┘          │
    └─────────────────────────────────────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │    MySQL     │
    │   Database   │
    └──────────────┘
```

### Request Flow (Target)

1. **API Request with Side Effects:**
   ```
   Client Request
        │
        ▼
   Laravel Controller
        │
        ▼
   Database Write
        │
        ▼
   Eloquent Observer Fires
        │
        ▼
   SendWebhookJob::dispatch()  ◄─── NON-BLOCKING (pushed to Redis)
        │
        ▼
   Return response immediately  ◄─── FAST RESPONSE

   [Async - Queue Worker]
        │
        ▼
   Process SendWebhookJob
        │
        ▼
   HTTP POST to WebSocket Server
        │
        ▼
   Broadcast to clients
   ```

2. **WebSocket Connection:**
   ```
   Client connects with token
        │
        ▼
   Socket.IO middleware
        │
        ▼
   Check Redis cache for token  ◄─── FAST (in-memory)
        │
        ├─── Cache HIT: Return cached user data
        │
        └─── Cache MISS:
                │
                ▼
             HTTP call to Laravel /api/auth/me
                │
                ▼
             Cache result in Redis (TTL: 15 min)
                │
                ▼
             Return user data
   ```

---

## Implementation Phases

### Phase 1: Async Webhook Dispatch (Priority: Critical)

**Objective:** Remove blocking HTTP calls from Laravel request cycle

**Duration:** 1-2 days

**Changes:**

#### 1.1 Install Redis on Server

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping  # Should return PONG
```

#### 1.2 Laravel: Add Redis Dependencies

```bash
cd vendora-backend-rest-api
composer require predis/predis
```

#### 1.3 Laravel: Create SendWebhookJob

**New File:** `app/Jobs/SendWebhookJob.php`

```php
<?php

namespace App\Jobs;

use App\Services\WebhookService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendWebhookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public array $backoff = [5, 30, 60];

    public function __construct(
        public string $event,
        public array $data
    ) {}

    public function handle(WebhookService $webhookService): void
    {
        $webhookService->send($this->event, $this->data);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('Webhook job failed', [
            'event' => $this->event,
            'error' => $exception->getMessage()
        ]);
    }
}
```

#### 1.4 Laravel: Update Observers

**File:** `app/Observers/ProductObserver.php`

```php
<?php

namespace App\Observers;

use App\Jobs\SendWebhookJob;
use App\Models\Product;

class ProductObserver
{
    public function created(Product $product): void
    {
        SendWebhookJob::dispatch('product:created', $product->toArray());
    }

    public function updated(Product $product): void
    {
        SendWebhookJob::dispatch('product:updated', $product->toArray());

        if ($product->wasChanged('stock')) {
            SendWebhookJob::dispatch('stock:updated', [
                'productId' => $product->id,
                'newStock' => $product->stock,
            ]);
        }
    }

    public function deleted(Product $product): void
    {
        SendWebhookJob::dispatch('product:deleted', ['id' => $product->id]);
    }
}
```

**File:** `app/Observers/OrderObserver.php`

```php
<?php

namespace App\Observers;

use App\Jobs\SendWebhookJob;
use App\Models\Order;

class OrderObserver
{
    public function created(Order $order): void
    {
        SendWebhookJob::dispatch('order:created', $order->toArray());
    }

    public function updated(Order $order): void
    {
        SendWebhookJob::dispatch('order:updated', $order->toArray());
    }
}
```

**File:** `app/Observers/CategoryObserver.php`

```php
<?php

namespace App\Observers;

use App\Jobs\SendWebhookJob;
use App\Models\Category;

class CategoryObserver
{
    public function created(Category $category): void
    {
        SendWebhookJob::dispatch('category:created', $category->toArray());
    }

    public function updated(Category $category): void
    {
        SendWebhookJob::dispatch('category:updated', $category->toArray());
    }

    public function deleted(Category $category): void
    {
        SendWebhookJob::dispatch('category:deleted', ['id' => $category->id]);
    }
}
```

#### 1.5 Laravel: Update Environment

**File:** `.env`

```env
# Queue Configuration
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

# Cache Configuration
CACHE_STORE=redis
```

#### 1.6 Laravel: Start Queue Worker

```bash
# Development
php artisan queue:work redis --tries=3

# Production (with PM2 or Supervisor)
# See Phase 3 for production setup
```

---

### Phase 2: WebSocket Server Scaling (Priority: High)

**Objective:** Enable horizontal scaling and reduce Laravel load

**Duration:** 1-2 days

**Changes:**

#### 2.1 WebSocket: Install Dependencies

```bash
cd vendora-websocket-server
npm install @socket.io/redis-adapter redis ioredis express-rate-limit
```

#### 2.2 WebSocket: Add Redis Configuration

**New File:** `src/redis.js`

```javascript
const Redis = require('ioredis');
const config = require('./config');

const redisConfig = {
    host: config.REDIS_HOST || '127.0.0.1',
    port: config.REDIS_PORT || 6379,
    password: config.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
};

const pubClient = new Redis(redisConfig);
const subClient = pubClient.duplicate();
const cacheClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Error:', err));
cacheClient.on('error', (err) => console.error('Redis Cache Error:', err));

module.exports = { pubClient, subClient, cacheClient };
```

#### 2.3 WebSocket: Update Config

**File:** `src/config.js`

```javascript
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3001,
    LARAVEL_API_URL: process.env.LARAVEL_API_URL || 'http://localhost:8000/api',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    CORS_ORIGINS: process.env.CORS_ORIGINS || '*',

    // Redis Configuration
    REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || null,

    // Token Cache Configuration
    TOKEN_CACHE_TTL: process.env.TOKEN_CACHE_TTL || 900, // 15 minutes
};
```

#### 2.4 WebSocket: Add Redis Adapter to Socket.IO

**File:** `src/socket/index.js`

```javascript
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { pubClient, subClient } = require('../redis');
const { authenticateSocket } = require('./auth');
const { broadcastEvent, sendToUser, sendToRole, getConnectedClients } = require('./handlers');
const config = require('../config');
const logger = require('../utils/logger');

function initializeSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: config.CORS_ORIGINS === '*' ? '*' : config.CORS_ORIGINS.split(','),
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 60000,
        transports: ['websocket', 'polling'],
    });

    // Attach Redis adapter for multi-instance support
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter attached');

    // Authentication middleware
    io.use(authenticateSocket);

    io.on('connection', (socket) => {
        logger.info(`Client connected: ${socket.id} (User: ${socket.userId})`);

        // Join user-specific room
        socket.join(`user:${socket.userId}`);
        socket.join('broadcast');
        if (socket.userRole) {
            socket.join(`role:${socket.userRole}`);
        }

        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });

        socket.on('disconnect', (reason) => {
            logger.info(`Client disconnected: ${socket.id} (Reason: ${reason})`);
        });

        socket.on('error', (error) => {
            logger.error(`Socket error for ${socket.id}:`, error);
        });
    });

    return { io, broadcastEvent, sendToUser, sendToRole, getConnectedClients };
}

module.exports = { initializeSocketServer };
```

#### 2.5 WebSocket: Add Token Caching to Auth

**File:** `src/socket/auth.js`

```javascript
const config = require('../config');
const logger = require('../utils/logger');
const { cacheClient } = require('../redis');

const TOKEN_CACHE_PREFIX = 'ws:token:';
const TOKEN_CACHE_TTL = config.TOKEN_CACHE_TTL || 900; // 15 minutes

/**
 * Get cached user data for token
 */
async function getCachedUser(token) {
    try {
        const cached = await cacheClient.get(`${TOKEN_CACHE_PREFIX}${token}`);
        if (cached) {
            logger.debug('Token cache HIT');
            return JSON.parse(cached);
        }
        logger.debug('Token cache MISS');
        return null;
    } catch (error) {
        logger.error('Redis cache error:', error);
        return null;
    }
}

/**
 * Cache user data for token
 */
async function cacheUser(token, userData) {
    try {
        await cacheClient.setex(
            `${TOKEN_CACHE_PREFIX}${token}`,
            TOKEN_CACHE_TTL,
            JSON.stringify(userData)
        );
        logger.debug('Token cached successfully');
    } catch (error) {
        logger.error('Redis cache set error:', error);
    }
}

/**
 * Invalidate cached token (call when user logs out)
 */
async function invalidateToken(token) {
    try {
        await cacheClient.del(`${TOKEN_CACHE_PREFIX}${token}`);
        logger.debug('Token cache invalidated');
    } catch (error) {
        logger.error('Redis cache delete error:', error);
    }
}

/**
 * Validate token with Laravel API
 */
async function validateTokenWithLaravel(token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(`${config.LARAVEL_API_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            logger.warn(`Token validation failed: ${response.status}`);
            return null;
        }

        const data = await response.json();
        return data.user || data;
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            logger.error('Token validation timed out');
        } else {
            logger.error('Token validation error:', error.message);
        }
        return null;
    }
}

/**
 * Socket.IO authentication middleware
 */
async function authenticateSocket(socket, next) {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            logger.warn('Connection attempt without token');
            return next(new Error('Authentication token required'));
        }

        // Try cache first
        let user = await getCachedUser(token);

        // If not cached, validate with Laravel
        if (!user) {
            user = await validateTokenWithLaravel(token);

            if (!user) {
                logger.warn('Invalid token provided');
                return next(new Error('Invalid authentication token'));
            }

            // Cache the validated user
            await cacheUser(token, user);
        }

        // Attach user info to socket
        socket.userId = user.id;
        socket.userEmail = user.email;
        socket.userName = user.name;
        socket.userRole = user.role || user.user_type;
        socket.token = token;

        logger.info(`Authenticated: ${user.email} (ID: ${user.id})`);
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        next(new Error('Authentication failed'));
    }
}

module.exports = {
    authenticateSocket,
    validateTokenWithLaravel,
    invalidateToken,
    getCachedUser,
    cacheUser,
};
```

#### 2.6 WebSocket: Add Rate Limiting

**File:** `src/webhook/routes.js` (update)

```javascript
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifySignature } = require('./verify');
const { handleWebhookEvent } = require('./handlers');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiter for webhook endpoints
const webhookLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 100, // 100 requests per second
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting
router.use(webhookLimiter);

// ... rest of existing routes
```

#### 2.7 WebSocket: Update Environment

**File:** `.env`

```env
PORT=3001
LARAVEL_API_URL=http://localhost:8000/api
WEBHOOK_SECRET=your-secret-here
CORS_ORIGINS=*

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Token Cache TTL (seconds)
TOKEN_CACHE_TTL=900
```

#### 2.8 WebSocket: PM2 Cluster Configuration

**New File:** `pm2.config.js`

```javascript
module.exports = {
    apps: [{
        name: 'vendora-websocket',
        script: './src/index.js',
        instances: 'max', // Use all available CPU cores
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
        },
        env_production: {
            NODE_ENV: 'production',
        },
        // Logging
        error_file: './logs/error.log',
        out_file: './logs/output.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        // Restart policy
        max_memory_restart: '500M',
        restart_delay: 1000,
        max_restarts: 10,
        min_uptime: '10s',
    }]
};
```

---

### Phase 3: Production Hardening (Priority: Medium)

**Objective:** Add monitoring, reliability features, and production configurations

**Duration:** 2-3 days

**Changes:**

#### 3.1 Laravel: Install Horizon (Queue Monitoring)

```bash
cd vendora-backend-rest-api
composer require laravel/horizon
php artisan horizon:install
php artisan migrate
```

#### 3.2 Laravel: Configure Supervisor for Queue Workers

**File:** `/etc/supervisor/conf.d/vendora-worker.conf`

```ini
[program:vendora-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /path/to/vendora-backend-rest-api/artisan queue:work redis --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=4
redirect_stderr=true
stdout_logfile=/var/log/vendora-worker.log
stopwaitsecs=3600
```

#### 3.3 WebSocket: Add Health Check Endpoint Enhancement

**File:** `src/webhook/routes.js` (add to existing)

```javascript
router.get('/health/detailed', (req, res) => {
    const io = req.app.get('io');
    const { getConnectedClients } = require('../socket/handlers');
    const stats = getConnectedClients(io);

    res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: {
            total: stats.total,
            uniqueUsers: stats.uniqueUsers,
        },
        redis: {
            connected: cacheClient.status === 'ready',
        },
    });
});
```

#### 3.4 WebSocket: Add Graceful Shutdown

**File:** `src/index.js` (update)

```javascript
// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
        logger.info('HTTP server closed');
    });

    // Close all socket connections gracefully
    io.close(() => {
        logger.info('Socket.IO connections closed');
    });

    // Close Redis connections
    await pubClient.quit();
    await subClient.quit();
    await cacheClient.quit();
    logger.info('Redis connections closed');

    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

### Phase 4: Advanced Features (Priority: Low)

**Objective:** Add event persistence and replay capabilities

**Duration:** 3-5 days

**Changes:**

#### 4.1 Event Persistence (Redis Streams)

Store recent events in Redis for replay on client reconnection:

```javascript
// Store event in Redis Stream
await redis.xadd('events:broadcast', 'MAXLEN', '~', '10000', '*',
    'event', eventName,
    'data', JSON.stringify(data)
);

// Client can request missed events since last seen ID
socket.on('sync:request', async ({ lastEventId }) => {
    const events = await redis.xrange('events:broadcast', lastEventId, '+');
    socket.emit('sync:events', events);
});
```

#### 4.2 Circuit Breaker for Laravel API

```javascript
const CircuitBreaker = require('opossum');

const laravelBreaker = new CircuitBreaker(validateTokenWithLaravel, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
});

laravelBreaker.fallback(() => {
    // Return cached data or reject connection
    throw new Error('Laravel API temporarily unavailable');
});
```

---

## File Changes Reference

### Laravel Backend (`vendora-backend-rest-api`)

| File | Action | Description |
|------|--------|-------------|
| `app/Jobs/SendWebhookJob.php` | Create | New queued job for webhooks |
| `app/Observers/ProductObserver.php` | Modify | Use dispatch instead of sync call |
| `app/Observers/OrderObserver.php` | Modify | Use dispatch instead of sync call |
| `app/Observers/CategoryObserver.php` | Modify | Use dispatch instead of sync call |
| `.env` | Modify | Add Redis configuration |
| `config/database.php` | Verify | Ensure Redis config present |
| `composer.json` | Modify | Add predis/predis |

### WebSocket Server (`vendora-websocket-server`)

| File | Action | Description |
|------|--------|-------------|
| `src/redis.js` | Create | Redis client configuration |
| `src/config.js` | Modify | Add Redis config variables |
| `src/socket/index.js` | Modify | Add Redis adapter |
| `src/socket/auth.js` | Modify | Add token caching |
| `src/webhook/routes.js` | Modify | Add rate limiting |
| `pm2.config.js` | Create | PM2 cluster configuration |
| `.env` | Modify | Add Redis configuration |
| `package.json` | Modify | Add new dependencies |

---

## Configuration Changes

### Environment Variables by Deployment Option

---

### Option A: Upstash (Shared Hosting)

#### Step 1: Create Upstash Account

1. Go to [upstash.com](https://upstash.com)
2. Sign up (free)
3. Click "Create Database"
4. Select region closest to your server (e.g., Frankfurt for EU)
5. Copy the connection details

#### Step 2: Laravel `.env` (Hostinger)

```env
# === UPSTASH REDIS CONFIGURATION ===

# Redis Connection (Upstash)
REDIS_CLIENT=predis
REDIS_HOST=eu1-fitting-ferret-12345.upstash.io
REDIS_PASSWORD=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REDIS_PORT=6379
REDIS_SCHEME=tls

# Queue (change from database to redis)
QUEUE_CONNECTION=redis

# Cache (change from database to redis)
CACHE_STORE=redis

# Session (keep as database for shared hosting)
SESSION_DRIVER=database
```

#### Step 3: WebSocket `.env` (Hostinger)

```env
PORT=3001
LARAVEL_API_URL=https://vendora-api.abedubas.dev/api
WEBHOOK_SECRET=your-secret-here
CORS_ORIGINS=*

# Redis Connection (Upstash)
REDIS_HOST=eu1-fitting-ferret-12345.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REDIS_TLS=true

# Token Cache TTL (seconds)
TOKEN_CACHE_TTL=900
```

#### Step 4: Update WebSocket `src/redis.js` for Upstash TLS

```javascript
const Redis = require('ioredis');
const config = require('./config');

const redisConfig = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT || 6379,
    password: config.REDIS_PASSWORD || undefined,
    tls: config.REDIS_TLS === 'true' ? {} : undefined, // Enable TLS for Upstash
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
};

const pubClient = new Redis(redisConfig);
const subClient = pubClient.duplicate();
const cacheClient = pubClient.duplicate();

module.exports = { pubClient, subClient, cacheClient };
```

---

### Option B: Hybrid (Laravel on Hostinger + WebSocket on VPS)

#### Step 1: Set Up VPS

```bash
# SSH into your new VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Redis
apt install -y redis-server

# Configure Redis for security
nano /etc/redis/redis.conf
```

Edit `/etc/redis/redis.conf`:
```conf
# Bind to localhost only (WebSocket is on same server)
bind 127.0.0.1

# Set memory limit
maxmemory 256mb
maxmemory-policy allkeys-lru

# Optional: Set password (recommended if Laravel needs remote access)
# requirepass YourSecureRedisPassword123
```

```bash
# Restart Redis
systemctl restart redis-server
systemctl enable redis-server

# Install PM2
npm install -g pm2

# Verify
redis-cli ping  # Should return PONG
node -v         # Should show v20.x
pm2 -v          # Should show PM2 version
```

#### Step 2: Deploy WebSocket to VPS

```bash
# Clone your repo (or upload files)
cd /var/www
git clone https://github.com/your-repo/vendora-websocket-server.git
cd vendora-websocket-server

# Install dependencies
npm install

# Create .env
nano .env
```

#### Step 3: WebSocket `.env` (VPS)

```env
PORT=3001
LARAVEL_API_URL=https://vendora-api.abedubas.dev/api
WEBHOOK_SECRET=your-secret-here
CORS_ORIGINS=https://vendora-api.abedubas.dev,https://abedubas.dev

# Redis Connection (local - FREE)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# Token Cache TTL (seconds)
TOKEN_CACHE_TTL=900

# Environment
NODE_ENV=production
```

#### Step 4: Start with PM2

```bash
# Start in cluster mode
pm2 start pm2.config.js

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# View status
pm2 status
pm2 logs vendora-websocket
```

#### Step 5: Configure Nginx (VPS)

```bash
apt install -y nginx
nano /etc/nginx/sites-available/vendora-ws
```

```nginx
server {
    listen 80;
    server_name vendora-ws.abedubas.dev;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/vendora-ws /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Install SSL with Certbot
apt install -y certbot python3-certbot-nginx
certbot --nginx -d vendora-ws.abedubas.dev
```

#### Step 6: Laravel `.env` (Hostinger) - Option B

For Option B, Laravel still needs external Redis (Upstash) since it's on shared hosting:

```env
# === REDIS CONFIGURATION (Upstash) ===
REDIS_CLIENT=predis
REDIS_HOST=eu1-fitting-ferret-12345.upstash.io
REDIS_PASSWORD=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REDIS_PORT=6379
REDIS_SCHEME=tls

# Queue
QUEUE_CONNECTION=redis

# Cache
CACHE_STORE=redis

# WebSocket Server URL (now points to VPS)
WEBSOCKET_SERVER_URL=https://vendora-ws.abedubas.dev/webhook/events
```

#### Step 7: Point DNS to VPS

In Hostinger DNS settings, update:
```
vendora-ws.abedubas.dev  →  A Record  →  YOUR_VPS_IP
```

---

### Option C: Full VPS Configuration

If both Laravel and WebSocket are on the same VPS, use localhost for Redis:

#### Laravel `.env` (VPS)

```env
# Redis Connection (local)
REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

# Queue
QUEUE_CONNECTION=redis

# Cache
CACHE_STORE=redis

# Session
SESSION_DRIVER=redis

# WebSocket (same server)
WEBSOCKET_SERVER_URL=http://127.0.0.1:3001/webhook/events
```

#### WebSocket `.env` (VPS - same server)

```env
PORT=3001
LARAVEL_API_URL=http://127.0.0.1:8000/api
WEBHOOK_SECRET=your-secret-here
CORS_ORIGINS=*

# Redis Connection (local)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

TOKEN_CACHE_TTL=900
NODE_ENV=production
```

---

### Redis Memory Configuration (VPS Only)

For self-hosted Redis, configure memory limits:

```conf
# /etc/redis/redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

---

## Capacity Estimates

### Before Optimization

| Metric | Capacity | Bottleneck |
|--------|----------|------------|
| Concurrent WS connections | ~500-1,000 | Single Node.js instance |
| API requests/second | ~50-100 | Blocking webhook calls |
| Webhook latency | 100-500ms | Synchronous HTTP |
| Connection auth latency | 50-200ms | Per-connection Laravel call |

### After Phase 1

| Metric | Capacity | Improvement |
|--------|----------|-------------|
| Concurrent WS connections | ~2,000 | 2-4x |
| API requests/second | ~500-1,000 | 10x |
| Webhook latency | <10ms (queued) | 50x |
| Connection auth latency | <5ms (cached) | 20x |

### After Phase 2

| Metric | Capacity | Improvement |
|--------|----------|-------------|
| Concurrent WS connections | ~20,000 | 20-40x |
| API requests/second | ~500-1,000 | (same) |
| Horizontal scaling | Unlimited instances | ∞ |

### After Phase 3+

| Metric | Capacity |
|--------|----------|
| Concurrent WS connections | 50,000-100,000+ |
| API requests/second | 1,000-5,000+ |
| Message throughput | 10,000+ events/second |

---

## Rollback Plan

### Phase 1 Rollback

If issues occur after Phase 1 deployment:

1. **Revert queue connection:**
   ```env
   QUEUE_CONNECTION=database
   ```

2. **Revert observers** to use direct `WebhookService->send()` calls

3. **Restart Laravel:**
   ```bash
   php artisan config:clear
   php artisan queue:restart
   ```

### Phase 2 Rollback

1. **Remove Redis adapter** from Socket.IO initialization

2. **Revert auth.js** to direct Laravel validation (remove caching)

3. **Restart WebSocket server:**
   ```bash
   pm2 restart vendora-websocket
   ```

---

## Testing Strategy

### Phase 1 Testing

1. **Unit Tests:**
   - Test `SendWebhookJob` dispatches correctly
   - Test job retry logic

2. **Integration Tests:**
   - Create product → verify webhook received
   - Simulate WebSocket server down → verify job queued and retried

3. **Load Tests:**
   ```bash
   # Using Apache Bench or similar
   ab -n 1000 -c 100 http://localhost:8000/api/products
   ```

### Phase 2 Testing

1. **Connection Tests:**
   - Connect 1000+ clients simultaneously
   - Verify all receive broadcast messages

2. **Failover Tests:**
   - Kill one WebSocket instance
   - Verify clients reconnect to other instances
   - Verify no message loss

3. **Cache Tests:**
   - Connect with same token multiple times
   - Verify only first connection hits Laravel API

---

## Monitoring Checklist

### Laravel

- [ ] Queue length (jobs pending)
- [ ] Failed jobs count
- [ ] Queue worker memory usage
- [ ] Redis connection status

### WebSocket Server

- [ ] Connected clients count
- [ ] Memory usage per instance
- [ ] Events broadcast per second
- [ ] Token cache hit ratio
- [ ] Redis adapter pub/sub latency

### Infrastructure

- [ ] Redis memory usage
- [ ] Redis connection count
- [ ] Network latency between services

---

## Appendix: Commands Reference

### Redis Operations

```bash
# Check Redis status
redis-cli ping

# Monitor Redis in real-time
redis-cli monitor

# Check memory usage
redis-cli info memory

# List all keys (development only)
redis-cli keys "*"

# Check queue length
redis-cli llen queues:default
```

### Laravel Queue Operations

```bash
# Start queue worker
php artisan queue:work redis

# Process single job
php artisan queue:work redis --once

# Restart all workers
php artisan queue:restart

# View failed jobs
php artisan queue:failed

# Retry failed job
php artisan queue:retry {id}

# Clear all failed jobs
php artisan queue:flush
```

### PM2 Operations

```bash
# Start cluster
pm2 start pm2.config.js

# View status
pm2 status

# View logs
pm2 logs vendora-websocket

# Restart all instances
pm2 restart vendora-websocket

# Graceful reload (zero-downtime)
pm2 reload vendora-websocket

# Scale instances
pm2 scale vendora-websocket 4
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | Claude | Initial document |
| 1.1 | Jan 2026 | Claude | Added hosting setup, deployment options (Upstash, Hybrid VPS, Full VPS), detailed configuration per option |

---

## Quick Start Guide

### Which Option Should I Choose?

```
START
  │
  ▼
┌─────────────────────────────────────┐
│ Do you have budget for VPS ($5/mo)? │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
      YES              NO
       │               │
       ▼               ▼
┌─────────────┐  ┌─────────────────────┐
│ Expecting   │  │ Use Option A        │
│ 500+ users? │  │ (Upstash - FREE)    │
└──────┬──────┘  └─────────────────────┘
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
┌────────────────┐  ┌─────────────────────┐
│ Use Option B   │  │ Use Option A        │
│ (Hybrid VPS)   │  │ (Upstash - FREE)    │
│ RECOMMENDED    │  │ Upgrade later       │
└────────────────┘  └─────────────────────┘
```

### Option A Quick Start (Upstash - 15 minutes)

```bash
# 1. Create Upstash account at upstash.com (free)
# 2. Create Redis database, copy credentials
# 3. Update Laravel .env
# 4. Update WebSocket .env
# 5. Deploy changes
# 6. Test!
```

### Option B Quick Start (Hybrid VPS - 1 hour)

```bash
# 1. Purchase VPS ($5/mo from Hostinger, DigitalOcean, etc.)
# 2. SSH into VPS
ssh root@your-vps-ip

# 3. Run setup script
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs redis-server nginx certbot python3-certbot-nginx
npm install -g pm2

# 4. Deploy WebSocket server
cd /var/www
git clone your-repo
cd vendora-websocket-server
npm install
cp .env.example .env
nano .env  # Configure

# 5. Start with PM2
pm2 start pm2.config.js
pm2 save
pm2 startup

# 6. Configure Nginx + SSL
# 7. Update DNS
# 8. Update Laravel .env with new WebSocket URL
# 9. Test!
```

---

## Support

For questions about this scaling plan:
- Review the [Identified Bottlenecks](#identified-bottlenecks) section
- Check [Configuration Changes](#configuration-changes) for your deployment option
- Refer to [Testing Strategy](#testing-strategy) before going live
