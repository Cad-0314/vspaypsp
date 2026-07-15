# Deployment Procedure for VSPayPSP

This document outlines the bulletproof, best-practice procedures for deploying changes to the VSPayPSP server. Following these steps ensures zero-downtime, secure, and reliable deployments while maintaining strict adherence to our development rules.

## 🌟 Core Deployment Philosophy
1. **GitHub as the Source of Truth:** All changes MUST be pushed to the `main` branch on GitHub before they can be deployed to the server. No direct editing on the live server.
2. **Environment Variables (.env):** All API details, credentials, and sensitive configuration MUST reside exclusively in the `.env` file. The `.env` file must NOT be committed to GitHub.
3. **Database Consistency:** We use the main database for everything. Any changes that affect the database schema must include migrations. Ensure data is synced after every configuration change in `.env`.
4. **Learn and Improve:** Any issues faced during deployment must be documented to learn for the future.

---

## 🚀 Pre-Deployment Checklist (Local Development)

Before triggering a deployment, ensure you have completed the following steps in your local environment:

1. **Verify Bilingual UI:** Ensure all frontend changes support both English and Chinese seamlessly.
2. **Sync API Docs:** If any API endpoints were added or modified, ensure the API documentation (`apidocs.ejs` and related routes) are updated to match.
3. **Database Migrations (Sequelize):** If you made changes to the database structure (models), ensure you have created and tested the corresponding migration scripts.
4. **Environment Variables:** If your changes require new environment variables, verify they are added to your local `.env` and documented in a `.env.example` file (if applicable).
5. **Commit and Push to GitHub:**
   ```bash
   git add .
   git commit -m "feat/fix: Description of the changes made"
   git push origin main
   ```

---

## 🛠️ Execution: The Deployment Process

We use a remote deployment script that connects to the VPS via SSH, pulls the latest code from GitHub, and safely restarts the application using PM2.

### Method 1: Automated Deployment via Local Script (Recommended & Bulletproof)

From your local machine, run the remote deployment script. This script connects via SSH, safely updates the environment, pulls the latest code, and reloads PM2 with zero downtime.

1. Ensure your local `.env` has the correct deployment credentials:
   ```env
   DEPLOY_HOST=your_vps_ip
   DEPLOY_USER=root
   DEPLOY_PASSWORD=your_vps_password
   ```

2. Execute the deployment script:
   ```bash
   node scripts/remote_deploy_fix.js
   ```

**What this script does internally (via `deploy.sh` on the server):**
- navigates to the project directory (`/www/wwwroot/gaurpay.site`)
- Updates specific `.env` variables if required (e.g., Telegram bot tokens).
- `git reset --hard HEAD` (Cleans up any untracked/accidental remote modifications).
- `git pull origin main` (Fetches your pushed changes).
- `npm install --production` (Installs any new dependencies).
- `pm2 reload gaurpay-api --update-env` (Restarts the Node.js server with zero downtime and loads the latest `.env`).

---

### Method 2: Manual SSH Deployment (Fallback)

If the automated script fails, you can perform the deployment manually via SSH:

1. **Connect to the VPS:**
   ```bash
   ssh root@<your_vps_ip>
   ```

2. **Navigate to the Project Directory:**
   ```bash
   cd /www/wwwroot/gaurpay.site
   ```

3. **Update Code and Restart:**
   ```bash
   # Run the deployment shell script directly
   bash ./deploy.sh
   ```

   *Alternatively, run the steps manually:*
   ```bash
   git reset --hard HEAD
   git pull origin main
   npm install --production
   pm2 reload gaurpay-api --update-env
   pm2 save
   ```

---

## 🗄️ Post-Deployment: Database Sync & Verification

1. **Database Sync:**
   - If utilizing Sequelize's `sync({ alter: true })` in development, ensure it behaves as expected on the main database. 
   - *Best Practice for Production:* Use actual migration scripts rather than auto-sync to prevent accidental data loss.

2. **Health Check:**
   - Visit your application's domain and verify that the UI loads correctly.
   - Test critical paths (login, payments, API endpoints).
   - Check the Bilingual (EN/ZH) toggle to ensure it functions perfectly on the live environment.

3. **Monitor Logs:**
   - On the server, monitor PM2 logs for any immediate errors:
     ```bash
     pm2 logs gaurpay-api --lines 50
     ```

---

## ⏪ Rollback Procedure (If things go wrong)

If a deployment breaks the live environment, follow these steps to instantly revert:

1. SSH into the server:
   ```bash
   ssh root@<your_vps_ip>
   cd /www/wwwroot/gaurpay.site
   ```

2. Find the previous stable Git commit hash:
   ```bash
   git log --oneline
   ```

3. Revert to the stable commit:
   ```bash
   git reset --hard <previous_commit_hash>
   npm install --production
   pm2 reload gaurpay-api --update-env
   ```

---

## 📚 Issue Log (Learning System)

*Whenever you face an issue during deployment, development, or configuration, document it here so the system and team learn from it for the future.*

### Known Issues & Solutions

| Date | Issue Description | Root Cause | Solution/Fix |
| :--- | :--- | :--- | :--- |
| [Date] | E.g., App crashed after `npm install` due to memory limit. | Small VPS RAM | Add Swap space or run `npm install` locally and upload `node_modules` (not recommended). Fixed by adding swap. |
| [Date] | UI changes didn't reflect after deployment. | Browser caching old EJS/CSS files. | Ensure cache-busting mechanisms are in place or instruct users to hard refresh. |

*(Add new rows as issues are encountered)*
