# AutoDeploy

A cloud-native deployment platform inspired by Vercel, built from scratch to enable serverless web application deployments. Simply provide a GitHub repository link, and AutoDeploy handles repository cloning, building, and deployment to a live endpoint.

## Overview

AutoDeploy is a distributed system that automates the entire deployment pipeline. Users submit a GitHub repository URL through the web UI, and the platform orchestrates cloning, building, and serving the application across multiple microservices using Redis for job queuing and Cloudflare R2 for artifact storage.

**Core Features:**
- Zero-friction deployment from GitHub repositories
- Asynchronous job processing with Redis queues
- S3-compatible artifact storage (Cloudflare R2)
- Subdomain-based application routing
- Multi-service distributed architecture
- Real-time deployment status tracking

## Architecture

AutoDeploy implements a **three-tier distributed microservices architecture** where each service is independent, stateless, and communicates asynchronously through message queues.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│                    (Port 5173 - Vite Dev)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP REST API
                             ▼
    ╔════════════════════════════════════════════════════════════════╗
    ║   ARCHITECTURE 1: REQUEST INGEST SERVICE (Upload Service)     ║
    ║                     Port 3000 (Express)                        ║
    ║                                                                ║
    ║  • Accept GitHub repository URLs from frontend                ║
    ║  • Clone repositories to local storage                        ║
    ║  • Upload source code to S3/R2                                ║
    ║  • Push job IDs to Redis queue (async message)                ║
    ║  • Return deployment ID for client tracking                   ║
    ╚════════════════════════╬═════════════════════════════════════╝
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌──────────────┐  ┌──────────────────┐
            │ Cloudflare   │  │ Redis Queue      │
            │   R2 (S3)    │  │                  │
            │              │  │ Channel: build-  │
            │ Stores:      │  │ queue (FIFO)     │
            │ - source/*   │  │                  │
            │ - dist/*     │  │ Pub/Sub: status  │
            └──────────────┘  │ hash             │
                              └────────┬─────────┘
                                       │ Message: Job ID
                                       ▼
    ╔════════════════════════════════════════════════════════════════╗
    ║ ARCHITECTURE 2: BUILD ORCHESTRATION SERVICE (Deploy Service)  ║
    ║                   Worker Process (Async)                       ║
    ║                                                                ║
    ║  • Listen to Redis queue (blocking pop)                       ║
    ║  • Download source code from S3                               ║
    ║  • Execute npm build (project-specific)                       ║
    ║  • Compress & upload distribution to S3                       ║
    ║  • Update Redis status hash (async completion)                ║
    ║  • Loop back to queue for next job                            ║
    ║  • Scales horizontally (multiple instances)                   ║
    ╚════════════════════════╬═════════════════════════════════════╝
                             │ Status Update
                             ▼
    ╔════════════════════════════════════════════════════════════════╗
    ║ ARCHITECTURE 3: RUNTIME REQUEST ROUTER (Request Handler)      ║
    ║                   Port 3001 (Express)                          ║
    ║                                                                ║
    ║  • Reverse proxy for deployed applications                    ║
    ║  • Extract deployment ID from subdomain                       ║
    ║  • Route requests to S3 distribution files                    ║
    ║  • Serve assets with correct MIME types                       ║
    ║  • Zero-downtime serving of multiple deployments              ║
    ║  • Stateless & infinitely scalable                            ║
    ╚════════════════════════════════════════════════════════════════╝
```

## Distributed System Architecture Patterns

AutoDeploy demonstrates production-grade distributed system design:

### **Pattern 1: Three-Tier Service Architecture**

| Service | Responsibility | Scalability | State |
|---------|---|---|---|
| **Upload Service** | Intake & Validation | Scale horizontally (stateless HTTP) | Ephemeral (clones deleted) |
| **Deploy Service** | Computation & Build | Scale horizontally (queue-based workers) | None (idempotent operations) |
| **Request Handler** | Routing & Serving | Scale infinitely (stateless proxy) | None (reads from S3) |

### **Pattern 2: Asynchronous Message-Driven Design**

```
Upload Service (Producer)  ──LPUSH──>  [build-queue]  ──BRPOP──>  Deploy Service (Consumer)
                                            ▲                              │
                                            │ HSET/HGET                    │
                                            └──────  [status hash]  ◄──────┘
                                                        ▲
                                                        │ HGET
                                                        │
Frontend Client (Polling)  ───GET /status?id=X ────────┘
```

**Benefits:**
- Decouples request handling from compute
- Enables independent service failures without cascading
- Upload Service returns immediately (fast user experience)
- Jobs queue up if Deploy Service is slow
- Can pause/resume builds by stopping Deploy Service

### **Pattern 3: Stateless & Horizontally Scalable Services**

```
Load Balancer
      │
      ├─→ Upload Service Instance 1 ┐
      ├─→ Upload Service Instance 2 ├─→ Shared Redis Queue
      ├─→ Upload Service Instance 3 ┘
      
Load Balancer
      │
      ├─→ Deploy Service Worker 1 ┐
      ├─→ Deploy Service Worker 2 ├─→ Shared Redis & S3
      ├─→ Deploy Service Worker 3 ┘
      
Load Balancer
      │
      ├─→ Request Handler Instance 1 ┐
      ├─→ Request Handler Instance 2 ├─→ Shared S3
      ├─→ Request Handler Instance 3 ┘
```

No sticky sessions, session affinity, or state replication needed.

### **Pattern 4: Distributed Data Consistency**

Two sources of truth:
- **Redis**: Fast, in-memory, eventual consistency (deployment status)
- **S3/R2**: Durable storage, single source of truth (application code & builds)

Workflow ensures consistency:
1. Upload Service uploads source to S3 (durable)
2. Upload Service updates Redis status (fast)
3. Deploy Service verifies S3 before building (safe)
4. Deploy Service uploads dist to S3 (durable)
5. Deploy Service updates Redis status (fast)

## System Components

### 1. Frontend (`./frontend`)
React 18 + TypeScript + Vite web application with modern UI.

**Technology Stack:**
- React 18.2.0
- TypeScript 5.x
- Vite (build tool)
- Tailwind CSS with custom animations
- Radix UI for accessible components
- Axios for API communication

**Scripts:**
```bash
npm run dev      # Start development server (port 5173)
npm run build    # TypeScript compile + Vite build
npm run preview  # Preview production build
```

### 2. Upload Service (`./vercel-upload-service`)
HTTP service that receives deployment requests and orchestrates the upload pipeline.

**Responsibilities:**
- Accept POST requests with GitHub repository URLs
- Clone repositories using simple-git
- Traverse and collect all repository files
- Upload files to Cloudflare R2 storage
- Push build ID to Redis queue
- Track deployment status via Redis hashes

**API Endpoints:**
- `POST /deploy` - Initiate deployment
  ```json
  {
    "repoUrl": "https://github.com/user/repo.git"
  }
  ```
  Response:
  ```json
  {
    "id": "generated-unique-id"
  }
  ```
- `GET /status?id={buildId}` - Check deployment status

**Dependencies:**
- Express 4.18.2
- simple-git 3.22.0 (Git operations)
- aws-sdk 2.1553.0 (S3 operations)
- Redis 4.6.13 (Job queuing)

### 3. Deploy Service (`./vercel-deploy-service`)
Long-running worker service that processes build jobs from the Redis queue.

**Responsibilities:**
- Listen for build jobs on Redis queue
- Download source files from S3
- Execute project build (npm run build, etc.)
- Upload compiled distribution to S3
- Update deployment status to "deployed"

**Key Features:**
- Blocking Redis pop for efficient queue consumption
- S3 folder download/upload operations
- Project-aware build execution
- Isolated build environments per deployment

**Dependencies:**
- Redis 4.7.1 (Job queue subscription)
- aws-sdk 2.1693.0 (S3 operations)
- TypeScript 5.9.3

### 4. Request Handler (`./vercel-request-handler`)
Reverse proxy service that routes user requests to deployed applications.

**Responsibilities:**
- Extract deployment ID from request hostname (id.100xdevs.com)
- Route requests to corresponding S3 distribution folder
- Serve files with appropriate MIME types
- Handle dynamic routing to index.html for SPA

**Endpoint:**
- `GET /*` - Catch-all route for serving deployed applications
  - Content-Type detection for HTML, CSS, JavaScript
  - S3 object retrieval with key construction: `dist/{id}{filePath}`

**Dependencies:**
- Express 4.18.2
- aws-sdk 2.1553.0

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, TypeScript, Vite | User interface |
| **Services** | Express.js, Node.js | HTTP servers & workers |
| **Queueing** | Redis 4.x | Asynchronous job processing |
| **Storage** | Cloudflare R2 (S3-compatible) | Artifact storage |
| **Git** | simple-git | Repository cloning |
| **Build** | npm/Node.js | Project compilation |

## Distributed System Resilience & Scalability

### Service Failure Isolation

The three-tier architecture ensures failures don't cascade:

**If Upload Service fails:**
```
User cannot submit new deployments
✓ Existing builds continue unaffected
✓ Request Handler keeps serving live apps
✓ Deploy Service processes queued jobs
```

**If Deploy Service fails:**
```
✓ Upload Service still accepts deployments
✓ Jobs queue in Redis (FIFO preservation)
⚠ Builds delayed until service restarts
✓ Request Handler serves previously built apps
```

**If Request Handler fails:**
```
✓ Upload Service still accepts deployments
✓ Deploy Service still processes builds
✗ Users cannot access deployed applications
→ Mitigation: Deploy multiple instances behind load balancer
```

### Horizontal Scaling Strategy

Deploy multiple instances of each service for high availability:

**Upload Service Scaling:**
```bash
# Start 3 instances behind load balancer
pm2 start upload_service.js -i 3

# Each instance handles concurrent requests
# Requests distributed by load balancer
# All share same Redis and S3 backend
```

**Deploy Service Scaling:**
```bash
# Start 5 worker instances
for i in {1..5}; do
  node deploy_service.js &
done

# All workers consume from same Redis queue
# One worker processes per job (automatic)
# No coordination needed
# Add more workers to increase throughput
```

**Request Handler Scaling:**
```bash
# Deploy behind CDN or load balancer
# Each instance independently serves from S3
# No state synchronization required
# Add instances as traffic grows
```

### Data Durability & Consistency

**Redis (Volatile):**
- Status hashes: Lost on server restart
- Build queue: Lost on server restart
- Mitigation: Enable AOF (Append-Only File) persistence

**S3/R2 (Durable):**
- Source code: Permanent until explicitly deleted
- Build artifacts: Permanent until TTL expires
- Single source of truth for all application data

**Consistency Guarantees:**
- Source code immediately written to S3 before returning ID (fail-safe)
- Build status updated in Redis AFTER S3 upload completes (atomic)
- Request Handler reads final artifact from S3 (immutable)

### Monitoring & Observability

Key metrics for distributed system health:

```
Upload Service:
  - Request rate (POST /deploy, GET /status)
  - Clone + upload latency
  - Queue depth (jobs waiting)
  - S3 operation errors

Deploy Service:
  - Queue consumption rate
  - Build success/failure rate
  - Build duration (p50, p95, p99)
  - Memory usage during builds
  - Worker thread utilization

Request Handler:
  - Request throughput
  - Response latency
  - S3 cache hit rate
  - 404 errors (missing deployments)
```

### Network Partition Resilience

**Scenario: Redis unavailable**
```
Upload Service: ✗ Cannot queue jobs
Deploy Service: ✗ Cannot poll queue
Request Handler: ✓ Continues serving (stateless)

Recovery: Replicas can serve as fallback
```

**Scenario: S3 unavailable**
```
Upload Service: ✗ Cannot upload source
Deploy Service: ✗ Cannot download source or upload artifacts
Request Handler: ✗ Cannot serve applications

Mitigation: Use S3 replication across regions
```

**Scenario: Network latency spike**
```
Upload Service: Tolerates (S3 upload is async to user)
Deploy Service: Tolerates (blocking Redis pop waits)
Request Handler: Impacted (user-facing latency)

Mitigation: Enable S3 caching, implement request timeouts
```

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Redis server running locally or accessible
- Cloudflare R2 credentials (or S3-compatible storage)
- Git

### Environment Configuration

Create environment files for each service with the following secrets:

**vercel-upload-service & vercel-deploy-service:**
```
AWS_ACCESS_KEY_ID=your_r2_access_key
AWS_SECRET_ACCESS_KEY=your_r2_secret_key
AWS_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
REDIS_URL=redis://localhost:6379
```

**vercel-request-handler:**
```
AWS_ACCESS_KEY_ID=your_r2_access_key
AWS_SECRET_ACCESS_KEY=your_r2_secret_key
AWS_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

### Installation Steps

1. **Clone and install dependencies:**
```bash
git clone https://github.com/your-repo/AutoDeploy.git
cd AutoDeploy

# Frontend
cd frontend && npm install
cd ../

# Upload Service
cd vercel-upload-service && npm install
cd ../

# Deploy Service
cd vercel-deploy-service && npm install
cd ../

# Request Handler
cd vercel-request-handler && npm install
cd ../
```

2. **Build all services:**
```bash
# Build frontend
cd frontend && npm run build

# Build backend services (TypeScript compilation)
cd ../vercel-upload-service && npm run build
cd ../vercel-deploy-service && npm run build
cd ../vercel-request-handler && npm run build
```

## Running the Services

### Local Development

**Terminal 1 - Redis Server**
```bash
redis-server
# Runs on redis://localhost:6379
```

**Terminal 2 - Upload Service (Port 3000)**
```bash
cd vercel-upload-service
npm run dev
```

**Terminal 3 - Deploy Service (Worker)**
```bash
cd vercel-deploy-service
npm run dev
```

**Terminal 4 - Request Handler (Port 3001)**
```bash
cd vercel-request-handler
npm run dev
```

**Terminal 5 - Frontend (Port 5173)**
```bash
cd frontend
npm run dev
```

Access the application at `http://localhost:5173`

### Docker Deployment

Build and run services in containers:

```bash
# Upload Service
docker build -t autodeploy-upload ./vercel-upload-service
docker run -p 3000:3000 --network host autodeploy-upload

# Deploy Service
docker build -t autodeploy-deploy ./vercel-deploy-service
docker run --network host autodeploy-deploy

# Request Handler
docker build -t autodeploy-handler ./vercel-request-handler
docker run -p 3001:3001 --network host autodeploy-handler
```

## Deployment Flow

```
1. User → Frontend: Submit GitHub repository URL
                    ↓
2. Frontend → Upload Service: POST /deploy with repoUrl
                    ↓
3. Upload Service:
   • Generate unique ID
   • Clone repository from GitHub
   • Traverse directory tree
   • Upload files to S3 as `output/{id}/*`
   • Push ID to Redis queue: LPUSH build-queue {id}
   • Set status: HSET status {id} "uploaded"
   • Return ID to user
                    ↓
4. User → Frontend: Poll GET /status?id={id}
                    ↓
5. Deploy Service (Worker):
   • Pop from queue: BRPOP build-queue
   • Download S3 folder: s3://vercel/output/{id}/*
   • Execute build: npm run build (project-specific)
   • Upload distribution: S3 upload dist/ → s3://vercel/dist/{id}/*
   • Update status: HSET status {id} "deployed"
                    ↓
6. Request Handler (Reverse Proxy):
   • User accesses: id.100xdevs.com
   • Extract ID from hostname
   • Fetch files from S3: s3://vercel/dist/{id}/...
   • Serve to client with proper MIME types
```

## API Reference

### Upload Service

#### POST `/deploy`
**Description:** Initiate a new deployment

**Request:**
```bash
curl -X POST http://localhost:3000/deploy \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/user/repo.git"}'
```

**Response:**
```json
{
  "id": "abc123def456"
}
```

**Status Codes:**
- `200 OK` - Deployment initiated successfully
- `400 Bad Request` - Missing or invalid repoUrl
- `500 Internal Server Error` - Clone or upload failure

#### GET `/status`
**Description:** Check deployment status

**Query Parameters:**
- `id` (string, required) - Deployment ID

**Request:**
```bash
curl http://localhost:3000/status?id=abc123def456
```

**Response:**
```json
{
  "status": "uploaded|deployed|building|failed"
}
```

## Data Flow & Redis Schema

**Redis Structures:**

1. **Build Queue:**
   ```
   Key: build-queue
   Type: List (FIFO)
   Values: [deployment-id-1, deployment-id-2, ...]
   Operations: LPUSH (enqueue), BRPOP (dequeue)
   ```

2. **Status Hash:**
   ```
   Key: status
   Type: Hash
   Fields: {id: status}
   Example: {
     "abc123": "uploaded",
     "def456": "deployed",
     "ghi789": "building"
   }
   Values: uploaded | building | deployed | failed
   ```

## S3/R2 Storage Structure

```
vercel (bucket)
├── output/
│   └── {deployment-id}/
│       ├── package.json
│       ├── src/
│       ├── public/
│       └── ... (all repository files)
└── dist/
    └── {deployment-id}/
        ├── index.html
        ├── assets/
        │   ├── main.*.js
        │   └── style.*.css
        └── ... (all built files)
```

## Understanding the Distributed Implementation

### Key Code Patterns for Distributed Systems

#### 1. Async Message Passing (Upload Service → Deploy Service)

**Upload Service** (Producer):
```typescript
// src/index.ts - Line 35-40
publisher.lPush("build-queue", id);        // Enqueue job (non-blocking)
publisher.hSet("status", id, "uploaded");  // Update status

res.json({ id: id })  // Return immediately to user
// Heavy work continues in background
```

This pattern is crucial: Return to user quickly while queuing async work. Prevents timeout on frontend.

**Deploy Service** (Consumer):
```typescript
// src/index.ts - Line 15-28
const res = await subscriber.brPop(
    commandOptions({ isolated: true }),
    'build-queue',
    0
);

const id = res.element;
// Download, build, upload happens here
```

Uses blocking Redis pop (`brPop`): Worker waits for messages instead of polling, saving CPU.

#### 2. Stateless Service Design (All Services)

**Request Handler Example**:
```typescript
// src/index.ts - Line 8-28
const app = express();

app.get("/*", async (req, res) => {
    const host = req.hostname;
    const id = host.split(".")[0];
    const filePath = req.path;
    
    // No session storage, no local state
    // All info extracted from request
    // Compute response from S3
})
```

Key: No persistent local state. Enables stateless scaling.

#### 3. Distributed Data Consistency (Redis + S3)

**Write Ordering in Upload Service**:
```typescript
// IMPORTANT: Order matters!
1. await uploadFile(...)           // S3 (durable, slow)
2. publisher.lPush(...)            // Redis queue (fast)
3. publisher.hSet(...)             // Redis hash (fast)
4. res.json({ id })                // Return to user
```

Files are durable BEFORE queue is updated → No orphaned jobs pointing to missing files.

**Read Verification in Deploy Service**:
```typescript
await downloadS3Folder(`output/${id}`)  // Verify files exist first
await buildProject(id);                 // Then process
```

Always verify source of truth before acting.

#### 4. Failure Isolation (Error Handling)

**Upload Service** error in one request doesn't affect others:
```typescript
app.post("/deploy", async (req, res) => {
    try {
        // Each request isolated
        const id = generate();
        // ... if this request fails ...
    } catch (err) {
        // Only this request fails
        // Other requests continue
    }
})
```

**Deploy Service** failure doesn't affect queue:
```typescript
while(1) {
    try {
        const res = await subscriber.brPop('build-queue', 0);
        // Process job
    } catch (err) {
        // Job remains in queue for retry
        // Service restarts and processes next job
    }
}
```

#### 5. Service Communication Over Shared Infrastructure

```
Three services never call each other directly.
Instead, they communicate through Redis & S3:

Upload Service:
  ├─ Writes to S3 ─────┐
  └─ Writes to Redis ──├─ Upload Service returns to user
                       │
Deploy Service:        │
  ├─ Reads from Redis <┤ Polls for new jobs
  ├─ Reads from S3 <───┤ Gets source code
  └─ Writes to S3 ─────┤ Stores built artifacts
                       │
Request Handler:       │
  └─ Reads from S3 <───┘ Serves applications

Result: Services are completely decoupled.
```

### Debugging the Distributed System

**Check Redis Queue Status**:
```bash
redis-cli
> LLEN build-queue           # Jobs waiting
> HGETALL status             # All deployment statuses
> LRANGE build-queue 0 -1    # See queue contents
```

**Monitor Service Communication**:
```bash
# Terminal 1: Watch queue growth
watch -n 1 "redis-cli LLEN build-queue"

# Terminal 2: Add deployment
curl -X POST http://localhost:3000/deploy -d '{"repoUrl":"..."}'

# Terminal 3: Watch Deploy Service processing
# You should see LLEN decrease
```

**Trace a Deployment**:
```bash
# 1. Submit deployment, get ID
DEPLOYMENT_ID="abc123"

# 2. Check status in Redis
redis-cli HGET status $DEPLOYMENT_ID

# 3. Check if files exist in S3
aws s3 ls s3://vercel/output/$DEPLOYMENT_ID/
aws s3 ls s3://vercel/dist/$DEPLOYMENT_ID/

# 4. Check Request Handler can access
curl -H "Host: ${DEPLOYMENT_ID}.100xdevs.com" http://localhost:3001/
```

### Testing Failure Scenarios

**Test Queue Resilience:**
```bash
# 1. Start all services normally
# 2. Kill Deploy Service: pkill -f "deploy_service.js"
# 3. Submit new deployment
# 4. Verify job queued in Redis (not lost)
redis-cli LLEN build-queue  # Should show 1
# 5. Restart Deploy Service
# 6. Job processes normally (recovery!)
```

**Test Upload Service Failure:**
```bash
# 1. Both Deploy Service and Request Handler running
# 2. Kill Upload Service: pkill -f "upload_service.js"
# 3. Deploy Service keeps processing queue
# 4. Request Handler keeps serving (no interruption to users!)
# 5. Restart Upload Service
# 6. User can submit new deployments again
```

**Test S3 Latency:**
```bash
# Simulate slow S3 by adding network delay
sudo tc qdisc add dev lo root netem delay 5000ms

# Now uploads/downloads have 5 second latency
# Observe: Upload Service still returns quickly (S3 is fire-and-forget via queue)
# Observe: Deploy Service handles increased latency gracefully

# Remove delay
sudo tc qdisc del dev lo root
```

## Error Handling

**Common Issues:**

1. **Redis Connection Fails**
   - Ensure Redis is running: `redis-cli ping`
   - Check REDIS_URL environment variable
   - Verify network connectivity

2. **S3 Upload Fails**
   - Validate AWS credentials
   - Check R2 bucket exists and is accessible
   - Verify IAM permissions

3. **Build Process Fails**
   - Check project has valid build script in package.json
   - Review build output logs in Deploy Service
   - Common: Missing dependencies, TypeScript errors

4. **Request Handler Returns 404**
   - Verify deployment ID is correct
   - Check files exist in S3 dist folder
   - Ensure hostname matches format: `{id}.100xdevs.com`

## Performance Considerations

- **Concurrent Builds:** Deploy Service is single-threaded; scale horizontally with multiple instances
- **Large Repositories:** Upload may timeout for massive repos; implement chunking
- **Redis Persistence:** Enable AOF/RDB for production queue reliability
- **S3 Operations:** Consider caching frequently accessed files
- **Cold Starts:** Pre-warm build dependencies for faster compilation

## Security Notes

⚠️ **Production Hardening Required:**
- Move credentials to environment files (not hardcoded)
- Implement authentication/authorization
- Add rate limiting on `/deploy` endpoint
- Validate GitHub URLs before cloning
- Sanitize deployment IDs for S3 key injection
- Use dedicated IAM roles with least-privilege policies
- Enable S3 bucket versioning and lifecycle policies
- Implement request signing for R2 API calls

## Future Enhancements

- [ ] Support multiple build frameworks (Next.js, Vue, Svelte, etc.)
- [ ] Real-time deployment logs via WebSockets
- [ ] Rollback to previous deployments
- [ ] Custom domain routing
- [ ] Build caching and incremental builds
- [ ] Horizontal scaling of Deploy Service instances
- [ ] Database integration for persistent deployment records
- [ ] GitHub webhook integration for auto-deployments
- [ ] Environment variable management UI
- [ ] Performance analytics and monitoring

## Screenshots

<img width="1437" alt="Screenshot 2024-09-28 at 6 41 14 PM" src="https://github.com/user-attachments/assets/36d07333-6f8b-4f18-8cfc-05f37c5d1997">
<img width="1023" alt="Screenshot 2024-09-28 at 6 39 33 PM" src="https://github.com/user-attachments/assets/b63416b9-93be-4daf-952f-a93fc57ad5e8">
<img width="1437" alt="Screenshot 2024-09-28 at 6 40 28 PM" src="https://github.com/user-attachments/assets/f2a2023c-c924-4a64-923f-cab81c9aab69">

## License

ISC

## Contributing

Contributions welcome! Please ensure:
- All services compile without TypeScript errors
- Code follows existing style conventions
- New features include error handling
- Documentation is updated accordingly
