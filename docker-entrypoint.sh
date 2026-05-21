#!/bin/sh
set -e

# Apply any pending schema migrations before starting the server
echo "Running database migrations..."
node_modules/.bin/prisma db push --schema=apps/web/prisma/schema.prisma --skip-generate

echo "Starting server..."
exec node apps/web/server.js
