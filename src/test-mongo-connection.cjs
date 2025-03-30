// Simple MongoDB connection test script
// Run this with: node src/test-mongo-connection.js
// This will help diagnose MongoDB connection issues

const mongoose = require('mongoose');

// Get credentials from environment
const mongoUser = process.env.MONGO_USER || 'admin';
const mongoPassword = process.env.MONGO_PASSWORD || 'eproglW5rtgph744'; // Replace with your password
const mongoHost = 'mongodb';
const mongoDb = 'ai_project_planner';

// Test direct connection
async function testConnection() {
  console.log('Testing MongoDB connection...');
  
  // Create the connection string with proper encoding
  const encodedUser = encodeURIComponent(mongoUser);
  const encodedPassword = encodeURIComponent(mongoPassword);
  const uri = `mongodb://${encodedUser}:${encodedPassword}@${mongoHost}:27017/${mongoDb}?authSource=admin`;
  
  console.log('Connection URI (safe version):', uri.replace(/\/\/[^:]+:[^@]+@/, '//USER:PASS@'));
  
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB successfully!');
    
    // Print database info
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:`);
    collections.forEach(col => console.log(`- ${col.name}`));
    
    // Test user count
    const userCount = await mongoose.connection.db.collection('users').countDocuments();
    console.log(`User collection contains ${userCount} documents`);
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Connection test complete.');
  } catch (error) {
    console.error('Connection error:', error);
    console.log('Error details:', JSON.stringify(error, null, 2));
  }
}

testConnection().catch(console.error);
