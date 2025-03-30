#!/bin/bash

# This script provides commands to directly debug MongoDB connection issues
# All commands should be run on the host system

echo "===== Direct MongoDB Debugging ====="

# 1. Check if MongoDB is running and healthy
echo -e "\n1. Checking MongoDB container status:"
docker inspect -f '{{.State.Status}} - {{.State.Health.Status}}' ai-project-planner-mongodb-1

# 2. Check MongoDB logs for authentication issues
echo -e "\n2. Checking MongoDB logs for authentication failures:"
docker logs ai-project-planner-mongodb-1 | grep -i "auth" | tail -10

# 3. Check the MongoDB admin user in the container
echo -e "\n3. Attempting to connect to MongoDB with direct connection:"
docker exec -i ai-project-planner-mongodb-1 mongosh admin --quiet --eval "db.runCommand('ping').ok"

# 4. Create a direct test script to run in the app container
cat > /var/www/ai-project-planner/direct-test.js << 'EOL'
// Direct test script - stripped down to basics
const { MongoClient } = require('mongodb');

async function main() {
  console.log("===== DIRECT MONGODB TEST =====");
  
  // Print environment variables
  console.log("Environment variables:");
  console.log("MONGO_USER:", process.env.MONGO_USER);
  console.log("MONGO_PASSWORD length:", process.env.MONGO_PASSWORD ? process.env.MONGO_PASSWORD.length : 0);
  console.log("MONGODB_URI set:", !!process.env.MONGODB_URI);
  
  // Try connecting with a hardcoded connection string first
  const testUri = "mongodb://admin:eproglW5rtgph744@mongodb:27017/ai_project_planner?authSource=admin";
  
  try {
    console.log("\nTrying hardcoded connection string...");
    const client = new MongoClient(testUri);
    await client.connect();
    const result = await client.db("admin").command({ ping: 1 });
    console.log("Hardcoded connection successful:", result);
    await client.close();
  } catch (error) {
    console.error("Hardcoded connection failed:", error.message);
  }
  
  // Try with URL-encoded password
  try {
    console.log("\nTrying with URL-encoded password...");
    const encodedPassword = encodeURIComponent("eproglW5rtgph744");
    const encodedUri = `mongodb://admin:${encodedPassword}@mongodb:27017/ai_project_planner?authSource=admin`;
    
    const client = new MongoClient(encodedUri);
    await client.connect();
    const result = await client.db("admin").command({ ping: 1 });
    console.log("URL-encoded connection successful:", result);
    await client.close();
  } catch (error) {
    console.error("URL-encoded connection failed:", error.message);
  }
  
  // Try with environment variables
  if (process.env.MONGODB_URI) {
    try {
      console.log("\nTrying with MONGODB_URI environment variable...");
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const result = await client.db("admin").command({ ping: 1 });
      console.log("Environment variable connection successful:", result);
      await client.close();
    } catch (error) {
      console.error("Environment variable connection failed:", error.message);
    }
  }
  
  // Try with a simple password without special characters
  try {
    console.log("\nTrying with simple password...");
    const simpleUri = "mongodb://admin:adminpassword123@mongodb:27017/ai_project_planner?authSource=admin";
    
    const client = new MongoClient(simpleUri);
    await client.connect();
    const result = await client.db("admin").command({ ping: 1 });
    console.log("Simple password connection successful:", result);
    await client.close();
  } catch (error) {
    console.error("Simple password connection failed:", error.message);
  }
}

main().catch(console.error);
EOL

# 5. Run the test script in the app container
echo -e "\n4. Running direct test script in app container:"
docker cp /var/www/ai-project-planner/direct-test.js ai-project-planner-app-1:/app/direct-test.js
docker exec -i ai-project-planner-app-1 node /app/direct-test.js

# 6. Create a script to reset MongoDB password to something simple
cat > /var/www/ai-project-planner/reset-mongo-password.sh << 'EOL'
#!/bin/bash

echo "===== MongoDB Password Reset ====="

# Define the new simple password without special characters
NEW_PASSWORD="adminpassword123"

# Create a JavaScript file to reset the admin password
cat > /tmp/reset-password.js << EOF
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
cat > /tmp/test-new-password.js << EOF
db = db.getSiblingDB('admin');
db.runCommand({ ping: 1 });
EOF

# Test the new password
echo "Testing new password..."
docker exec -i ai-project-planner-mongodb-1 mongosh --quiet --username admin --password "$NEW_PASSWORD" --authenticationDatabase admin admin --eval "db.runCommand({ ping: 1 })" || echo "Failed to authenticate with new password"

echo "Restart the containers with: docker-compose down && docker-compose up -d"
EOL

chmod +x /var/www/ai-project-planner/reset-mongo-password.sh

# 7. Display next steps
echo -e "\n===== Next Steps ====="
echo "1. Review the output above for authentication errors"
echo "2. If direct authentication is failing, run the password reset script:"
echo "   sudo ./reset-mongo-password.sh"
echo "3. After resetting the password, restart containers:"
echo "   docker-compose down && docker-compose up -d"
echo "4. If issues persist, you may need to rebuild the MongoDB container from scratch."

echo -e "\nDebugging completed."