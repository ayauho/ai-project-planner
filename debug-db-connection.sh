#!/bin/bash

echo "===== Running MongoDB Connection Tests ====="

# Print environment variables (without exposing passwords)
echo "Environment variables:"
env | grep -v PASSWORD | grep -v KEY

# Run the test connection script
echo -e "\nRunning Node.js test script:"
node src/test-mongo-connection.cjs

# Also test direct MongoDB connection
echo -e "\nTesting direct MongoDB connection:"
if command -v mongosh &> /dev/null; then
  mongosh --eval "db.runCommand('ping').ok" \
    --username "$MONGO_USER" \
    --password "$MONGO_PASSWORD" \
    --authenticationDatabase "admin" \
    mongodb:27017/ai_project_planner
else
  echo "mongosh command not found. Skipping direct MongoDB connection test."
fi

echo -e "\nDebugging complete!"
