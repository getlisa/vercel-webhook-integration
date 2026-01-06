#!/bin/bash

echo "🚀 Deploying Retell AI Webhook to Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Login to Vercel (if not already logged in)
echo "🔐 Checking Vercel authentication..."
vercel whoami || vercel login

# Deploy to production
echo "📦 Deploying to production..."
vercel --prod

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set your Retell API key:"
    echo "   vercel env add RETELL_API_KEY"
    echo ""
    echo "2. Redeploy with environment variables:"
    echo "   vercel --prod"
    echo ""
    echo "3. Test your webhook:"
    echo "   curl https://your-project.vercel.app/"
    echo ""
    echo "4. Configure webhook URL in Retell AI dashboard:"
    echo "   https://your-project.vercel.app/webhook"
else
    echo "❌ Deployment failed. Check the error messages above."
fi