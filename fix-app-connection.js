// MongoDB connection string builder with proper URL encoding
const fs = require('fs');
require('dotenv').config();

// Get credentials from environment
const mongoUser = process.env.MONGO_USER || 'admin';
const mongoPassword = process.env.MONGO_PASSWORD || '';
const mongoHost = 'mongodb';
const mongoPort = '27017';
const mongoDb = 'ai_project_planner';

// URL encode the password to handle special characters
const encodedPassword = encodeURIComponent(mongoPassword);

// Construct the connection string
const uri = `mongodb://${mongoUser}:${encodedPassword}@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`;

// Create updated .env content
const envContent = fs.readFileSync('.env', 'utf8');
const updatedEnvContent = envContent.replace(
  /MONGODB_URI=.*/,
  `MONGODB_URI=mongodb://${mongoUser}:${encodedPassword}@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`
);

// Write updated .env file
fs.writeFileSync('.env.updated', updatedEnvContent);

console.log('Original connection string (sanitized):');
console.log(`mongodb://${mongoUser}:[PASSWORD]@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`);

console.log('\nUpdated connection string with URL encoding (sanitized):');
console.log(`mongodb://${mongoUser}:[PASSWORD]@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`);

console.log('\nUpdated .env file has been written to .env.updated');
console.log('To apply the changes, run:');
console.log('  cp .env.updated .env');
console.log('  docker-compose down');
console.log('  docker-compose up -d');
