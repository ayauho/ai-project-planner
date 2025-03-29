// MongoDB connection test script
const { MongoClient } = require('mongodb');
const util = require('util');

// Check environment variables
console.log('===== Environment Variables =====');
console.log(`MONGO_USER: ${process.env.MONGO_USER}`);
console.log(`MONGO_PASSWORD: ${process.env.MONGO_PASSWORD ? '[SET]' : '[NOT SET]'}`);
console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/mongodb:\/\/([^:]+):([^@]+)@/, 'mongodb://[USER]:[PASS]@') : '[NOT SET]'}`);

// Try connecting with env URI
async function testConnectionWithEnvUri() {
  console.log('\n===== Testing connection with MONGODB_URI env variable =====');
  
  if (!process.env.MONGODB_URI) {
    console.log('MONGODB_URI not set, skipping test');
    return;
  }
  
  const client = new MongoClient(process.env.MONGODB_URI, {
    monitorCommands: true
  });
  
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Connected successfully');
    
    const db = client.db();
    console.log(`Connected to database: ${db.databaseName}`);
    
    const collections = await db.listCollections().toArray();
    console.log(`Collections found: ${collections.length}`);
    console.log(collections.map(c => c.name).join(', '));
    
    await client.close();
    console.log('Connection closed');
    return true;
  } catch (error) {
    console.error('Connection error:', util.inspect(error, { depth: null }));
    return false;
  }
}

// Try connecting with explicitly constructed URI
async function testConnectionWithExplicitUri() {
  console.log('\n===== Testing connection with explicitly constructed URI =====');
  
  // Get credentials from environment or use defaults
  const mongoUser = process.env.MONGO_USER || 'admin';
  const mongoPassword = process.env.MONGO_PASSWORD || 'adminpassword123';
  const mongoHost = 'mongodb';
  const mongoPort = '27017';
  const mongoDb = 'ai_project_planner';
  
  // URL encode the password to handle special characters
  const encodedPassword = encodeURIComponent(mongoPassword);
  
  // Construct the connection string
  const uri = `mongodb://${mongoUser}:${encodedPassword}@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`;
  console.log(`URI (sanitized): mongodb://${mongoUser}:[HIDDEN]@${mongoHost}:${mongoPort}/${mongoDb}?authSource=admin`);
  
  const client = new MongoClient(uri, {
    monitorCommands: true
  });
  
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Connected successfully');
    
    const db = client.db();
    console.log(`Connected to database: ${db.databaseName}`);
    
    const collections = await db.listCollections().toArray();
    console.log(`Collections found: ${collections.length}`);
    console.log(collections.map(c => c.name).join(', '));
    
    await client.close();
    console.log('Connection closed');
    return true;
  } catch (error) {
    console.error('Connection error:', util.inspect(error, { depth: null }));
    return false;
  }
}

// Run tests
async function runTests() {
  let envUriSuccess = await testConnectionWithEnvUri();
  let explicitUriSuccess = await testConnectionWithExplicitUri();
  
  console.log('\n===== Test Results =====');
  console.log(`MONGODB_URI env variable connection: ${envUriSuccess ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Explicit connection string: ${explicitUriSuccess ? 'SUCCESS' : 'FAILED'}`);
  
  if (!envUriSuccess && !explicitUriSuccess) {
    console.log('\nSuggestions:');
    console.log('1. Check if MongoDB container is running and healthy');
    console.log('2. Verify MongoDB credentials are correct');
    console.log('3. Check if "mongodb" hostname is resolvable from the application container');
    console.log('4. Try URL encoding special characters in the password');
  }
}

runTests().catch(console.error);
