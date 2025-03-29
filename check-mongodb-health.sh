#!/bin/bash

source .env

echo "Checking MongoDB health..."
docker exec ai-project-planner-mongodb-1 mongosh --quiet --eval "db.adminCommand('ping').ok" --host localhost --authenticationDatabase admin -u "$MONGO_USER" -p "$MONGO_PASSWORD"

if [ $? -eq 0 ]; then
  echo "MongoDB is healthy!"
else
  echo "MongoDB health check failed!"
  echo "Trying to check connection without authentication..."
  docker exec ai-project-planner-mongodb-1 mongosh --quiet --eval "try { db.adminCommand('ping').ok } catch(e) { print(e) }"
fi
