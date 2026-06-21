#!/bin/bash
echo "🚀 Deploying updates..."
git pull origin main
npm install --production
pm2 reload gaurpay-api --update-env
echo "✅ Deployment complete!"
