# Deployment Guide: Payable PSP

## 1. System Requirements
- **Node.js**: v16 or higher (LTS recommended)
- **Database**: MySQL / PostgreSQL (Turso supported)
- **Process Manager**: PM2
- **Web Server**: Nginx (via aaPanel)

## 2. Quick-Start (Cloning)
To run this project on a fresh server:

1. **Clone Repository**:
   ```bash
   git clone https://github.com/Cad-0314/vspaypsp.git
   cd vspaypsp
   ```

2. **Setup Environment**:
   - Copy `.env.example` to `.env` (create one if missing).
   - Fill in `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, and `SESSION_SECRET`.

3. **Install & Start**:
   ```bash
   npm install
   pm2 start server.js --name "payable"
   ```

## 3. Workflow for Frequent Updates
For rapid iteration, use this automation script.

1. **Create a `deploy.sh` file** in the project root:
   ```bash
   #!/bin/bash
   echo "🚀 Deploying updates..."
   git pull origin main
   npm install --production
   pm2 reload payable --update-env
   echo "✅ Deployment complete!"
   ```
2. **Make executable**: `chmod +x deploy.sh`
3. **Run Update**: `./deploy.sh`

## 4. Scalability Configurations
To handle high traffic and ensure stability:

### PM2 Cluster Mode (Multi-Core)
Utilize all CPU cores by running in cluster mode:
```bash
pm2 start server.js -i max --name "payable"
```
*Note: Ensure your `SESSION_SECRET` is consistent. For multi-server setups, use Redis for sessions.*

### Database Connection Pooling
The system is pre-configured with a connection pool of **50** in `src/config/database.js`. This is optimized for high-volume environments (~10,000 orders/min). ensure your database server (e.g., MySQL) configuration `max_connections` is set higher than 100 to support this.

### aaPanel / Nginx Optimization
- **Enable Gzip**: Compress responses for faster API calls.
- **Cache Static Files**: Set expiry for `/public` folder assets (images, css).
- **Sticky Sessions**: If using Cluster Mode without Redis, enable sticky sessions in Nginx.

## 5. First Time Setup (aaPanel)
1. **Node Project**: Create a new Node project in aaPanel website settings.
2. **Path**: Select the cloned `vspaypsp` folder.
3. **Startup Script**: `server.js`
4. **Run Option**: Select "Cluster" mode (if available) or standard.
5. **Domain/SSL**: Bind domain and apply Let's Encrypt.

## 6. Important Notes
- **Database Migrations**: The application automatically syncs the database schema (`sequelize.sync`) when the server starts. You do not need to run manual migration commands.
- **Credentials Backfill**: On startup, the server automatically generates `apiKey` and `apiSecret` for any merchants missing them.
- **Environment Variables**: Ensure your `.env` file is present in the root directory with correct `DB_` credentials and `APP_URL`.

## 7. Troubleshooting
- **View Logs**:
  ```bash
  pm2 logs server --lines 50
  ```
- **Check Health**: Visit `https://your-domain.com/health` should return `{"status":"ok"}`.
