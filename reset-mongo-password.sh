#!/bin/bash

echo "===== MongoDB Password Reset ====="

# Define the new simple password without special characters
NEW_PASSWORD="adminpassword123"

# Create a JavaScript file to reset the admin password
cat > /tmp/reset-password.cjs << EOF
db = db.getSiblingDB('admin');
db.changeUserPassword('admin', '$NEW_PASSWORD');
EOF

# Try resetting using mongosh
echo "Attempting to reset MongoDB admin password..."
docker exec -i ai-project-planner-mongodb-1 mongosh admin --quiet --eval "db.changeUserPassword('admin', '$NEW_PASSWORD')" || echo "Failed to reset password with mongosh"

# Update the .env file with the new password
echo "Updating .env file with new password..."
sed -i "s/MONGO_PASSWORD=.*/MONGO_PASSWORD=$NEW_PASSWORD/" /var/www/ai-project-planner/.env

# Create a test file to verify the new password works
cat > /tmp/test-new-password.cjs << EOF
db = db.getSiblingDB('admin');
db.runCommand({ ping: 1 });
EOF

# Test the new password
echo "Testing new password..."
docker exec -i ai-project-planner-mongodb-1 mongosh --quiet --username admin --password "$NEW_PASSWORD" --authenticationDatabase admin admin --eval "db.runCommand({ ping: 1 })" || echo "Failed to authenticate with new password"

echo "Restart the containers with: docker-compose down && docker-compose up -d"
