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

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│                    (Port 5173 - Vite Dev)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ API Calls
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Upload Service (Express)                           │
│                     (Port 3000)                                 │
│  • Receive GitHub URLs                                          │
│  • Clone repositories                                           │
│  • Upload artifacts to S3                                       │
│  • Enqueue build jobs to Redis                                  │
│  • Update status in Redis Hash                                  │
└────────────┬────────────────────────────────────┬───────────────┘
             │                                    │
             ▼                                    ▼
         ┌──────────────┐              ┌──────────────────┐
         │ Cloudflare   │              │ Redis Pub/Sub    │
         │   R2 (S3)    │              │  - build-queue   │
         │              │              │  - status hashes │
         └──────────────┘              └──────────────────┘
                                             │
                                             ▼
                                    ┌────────────────────┐
                                    │ Deploy Service     │
                                    │ (Worker)           │
                                    │                    │
                                    │ • Pop build queue  │
                                    │ • Download S3      │
                                    │ • Build project    │
                                    │ • Upload dist      │
                                    │ • Update status    │
                                    └────────────────────┘
                                             │
                                             ▼
                                    ┌────────────────────┐
                                    │ Request Handler    │
                                    │ (Port 3001)        │
                                    │                    │
                                    │ Reverse Proxy      │
                                    │ Subdomain Router   │
                                    │ S3 Content Serve   │
                                    └────────────────────┘
```

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
