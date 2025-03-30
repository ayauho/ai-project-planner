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
