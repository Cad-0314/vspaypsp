#!/bin/bash
echo "🚀 Deploying updates..."
git pull origin main
npm install --production
pm2 reload payable --update-env
echo "✅ Deployment complete!"
