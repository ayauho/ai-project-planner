#!/bin/bash

echo "==== Container Network Diagnostics ===="

echo -e "\nTesting network from MongoDB container..."
docker exec -it ai-project-planner-mongodb-1 bash -c "ping -c 2 ai-project-planner-app-1 || echo 'Ping failed'"

echo -e "\nTesting network from App container..."
docker exec -it ai-project-planner-app-1 bash -c "ping -c 2 ai-project-planner-mongodb-1 || echo 'Ping failed'"
docker exec -it ai-project-planner-app-1 bash -c "ping -c 2 mongodb || echo 'Ping failed'"

echo -e "\nTesting DNS resolution..."
docker exec -it ai-project-planner-app-1 bash -c "getent hosts mongodb || echo 'DNS lookup failed'"
docker exec -it ai-project-planner-app-1 bash -c "getent hosts ai-project-planner-mongodb-1 || echo 'DNS lookup failed'"

echo -e "\nTesting MongoDB port..."
docker exec -it ai-project-planner-app-1 bash -c "nc -zv mongodb 27017 || echo 'MongoDB port test failed'"
