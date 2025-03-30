/**
 * MongoDB URL Encoder Utility
 * Ensures consistent URL encoding of MongoDB connection strings throughout the application
 */

/**
 * Encode a MongoDB connection string to properly handle special characters in credentials
 * @param uri The MongoDB connection URI string
 * @returns Properly encoded URI
 */
export function encodeMongoDBUri(uri: string): string {
  if (!uri) return uri;
  
  try {
    // Check if the URI follows the MongoDB format
    const matches = uri.match(/^(mongodb:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (!matches) return uri;
    
    const [, protocol, username, password, rest] = matches;
    
    // Encode both username and password
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    
    // Debug logging (password length only for privacy)
    console.log(`MongoDB URI encoder: username=${username}, encoded=${encodedUsername}`);
    console.log(`MongoDB URI encoder: password length=${password.length}, encoded length=${encodedPassword.length}`);
    
    // Create properly encoded URI
    return `${protocol}${encodedUsername}:${encodedPassword}@${rest}`;
  } catch (error) {
    console.error("Error encoding MongoDB URI:", error);
    return uri; // Return original URI if encoding fails
  }
}

/**
 * Safely encode environment-based MongoDB connection string
 */
export function getEncodedMongoDBUri(): string {
  try {
    // Get URI from environment or construct it
    const uri = process.env.MONGODB_URI || '';
    
    if (uri) {
      // If URI is directly provided, encode it
      return encodeMongoDBUri(uri);
    } else if (process.env.MONGO_USER && process.env.MONGO_PASSWORD) {
      // Construct and encode URI from components
      const encodedUser = encodeURIComponent(process.env.MONGO_USER);
      const encodedPassword = encodeURIComponent(process.env.MONGO_PASSWORD);
      const host = 'mongodb';
      const port = '27017';
      const database = 'ai_project_planner';
      
      console.log(`Constructed MongoDB URI from env variables (user=${process.env.MONGO_USER})`);
      return `mongodb://${encodedUser}:${encodedPassword}@${host}:${port}/${database}?authSource=admin`;
    }
    
    // Fallback to default values
    return 'mongodb://admin:devpassword@mongodb:27017/ai_project_planner?authSource=admin';
  } catch (error) {
    console.error("Error generating MongoDB URI:", error);
    return 'mongodb://admin:devpassword@mongodb:27017/ai_project_planner?authSource=admin';
  }
}
