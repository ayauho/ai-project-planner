# MongoDB Connection Debugging

This document provides steps to diagnose and fix MongoDB connection issues.

## Step 1: Run Diagnostic Scripts

Run the MongoDB connection test inside the app container:

```bash
# Install test dependencies if needed
docker exec -it ai-project-planner-app-1 npm install mongodb dotenv

# Run the diagnostic script
docker exec -it ai-project-planner-app-1 node app-mongo-test.cjs
```

Test network connectivity:

```bash
./test-network.sh
```

## Step 2: Fix Connection Issues

If the diagnostic script shows that URL encoding is needed for the password:

```bash
# Generate an updated .env file with URL-encoded password
docker exec -it ai-project-planner-app-1 node fix-app-connection.cjs

# Apply the updated .env file
cp .env.updated .env

# Restart containers
docker-compose down
docker-compose up -d
```

## Step 3: Manual Connection Testing

You can test MongoDB connection directly:

```bash
# Direct MongoDB connection
docker exec -i ai-project-planner-mongodb-1 mongosh "mongodb://admin:PASSWORD@localhost:27017/ai_project_planner?authSource=admin"

# Test from app container with Docker network
docker exec -it ai-project-planner-app-1 bash -c 'MONGO_PASSWORD="YOUR_PASSWORD_HERE" && mongosh "mongodb://admin:$MONGO_PASSWORD@mongodb:27017/ai_project_planner?authSource=admin"'
```

## Step 4: Common Issues

1. **Special characters in password** - Make sure the password is URL encoded in connection strings
2. **Network issues** - Make sure containers can reach each other
3. **Authentication source** - Make sure `authSource=admin` is specified
4. **Environmental differences** - Ensure consistent credentials between containers

## Step 5: Last Resort

If all else fails, simplify by using a password without special characters:

1. Update the password in MongoDB:
```bash
docker exec -i ai-project-planner-mongodb-1 mongosh admin --eval 'db.changeUserPassword("admin", "simple123password")'
```

2. Update your .env file with the new password and restart containers.
