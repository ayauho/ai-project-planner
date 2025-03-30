#!/bin/bash
set -e

echo "=== MongoDB Password Truncation Fix ==="

# Create a diagnostic script to check full password usage
echo "Creating MongoDB password diagnostic tool..."
cat > scripts/check-password-encoding.js << 'EOF'
// Check how passwords are being processed in MongoDB connection string
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

// Get environment variables
const envPassword = process.env.MONGO_PASSWORD || '';
const envUri = process.env.MONGODB_URI || '';

console.log('=== MongoDB Password Encoding Check ===');
console.log(`Configured password length: ${envPassword.length} characters`);

// Function to test if password is properly URL encoded
function testPasswordEncoding() {
  // Special characters that should be URL encoded
  const specialChars = '@!#$&\'()*+,/:;=?[]^`{|}~ %<>"';
  
  console.log('\nChecking if password contains special characters that need encoding:');
  let needsEncoding = false;
  
  for (const char of specialChars) {
    if (envPassword.includes(char)) {
      console.log(`- Contains '${char}' character which requires URL encoding`);
      needsEncoding = true;
    }
  }
  
  if (!needsEncoding) {
    console.log('- No special characters found that require URL encoding');
  }
  
  // Check MongoDB URI for proper encoding
  if (envUri) {
    console.log('\nAnalyzing MONGODB_URI format:');
    
    try {
      // Extract password from URI
      const uriMatch = envUri.match(/mongodb:\/\/[^:]+:([^@]+)@/);
      if (uriMatch && uriMatch[1]) {
        const uriPassword = uriMatch[1];
        console.log(`- Password length in URI: ${uriPassword.length} characters`);
        
        if (uriPassword.length !== envPassword.length) {
          console.log(`⚠️ WARNING: Password length mismatch between environment variable (${envPassword.length}) and URI (${uriPassword.length})`);
        }
        
        // Check if password in URI matches the environment variable
        if (uriPassword === envPassword) {
          console.log('- Password in URI matches environment variable');
        } else if (uriPassword === encodeURIComponent(envPassword)) {
          console.log('- Password in URI is URL encoded version of environment variable');
        } else {
          console.log('⚠️ WARNING: Password in URI does not match environment variable');
        }
      } else {
        console.log('⚠️ Could not extract password from URI');
      }
    } catch (error) {
      console.log(`Error analyzing URI: ${error.message}`);
    }
  }
}

// Proper way to create MongoDB connection string
function getDiagnosticInfo() {
  console.log('\n=== Connection String Construction Diagnostic ===');
  
  const username = process.env.MONGO_USER || 'admin';
  const password = process.env.MONGO_PASSWORD || '';
  const host = 'mongodb';
  const port = '27017';
  const database = 'ai_project_planner';
  const options = 'authSource=admin';
  
  console.log('Using credentials:');
  console.log(`- Username: ${username}`);
  console.log(`- Password: ${'*'.repeat(password.length)} (${password.length} characters)`);
  
  // Raw connection string (not URL encoded)
  const rawUri = `mongodb://${username}:${password}@${host}:${port}/${database}?${options}`;
  console.log(`\nRaw connection string would be ${rawUri.length} characters`);
  
  // Properly encoded connection string
  const encodedPassword = encodeURIComponent(password);
  const encodedUri = `mongodb://${username}:${encodedPassword}@${host}:${port}/${database}?${options}`;
  console.log(`Properly encoded connection string would be ${encodedUri.length} characters`);
  
  if (password !== encodedPassword) {
    console.log('\n⚠️ Password requires URL encoding. Special characters detected.');
    console.log(`- Raw password: ${password.substring(0, 3)}${'*'.repeat(password.length - 3)}`);
    console.log(`- Encoded password: ${encodedPassword.substring(0, 3)}${'*'.repeat(encodedPassword.length - 3)}`);
  } else {
    console.log('\nPassword does not contain special characters requiring URL encoding');
  }
  
  // Check if MongoDB URI in environment matches either of these formats
  if (envUri) {
    if (envUri === rawUri) {
      console.log('\n⚠️ Currently using raw, non-encoded connection string');
    } else if (envUri === encodedUri) {
      console.log('\n✅ Currently using properly encoded connection string');
    } else {
      console.log('\n⚠️ Current connection string does not match expected formats');
    }
  }
}

// Run diagnostics
testPasswordEncoding();
getDiagnosticInfo();
EOF

# Create the fix for MongoDB URL encoding
echo "Creating MongoDB URL encoding fix..."
cat > src/lib/url-encode-mongodb.js << 'EOF'
/**
 * MongoDB Connection URL Encoder
 * 
 * This utility ensures special characters in MongoDB credentials are properly URL-encoded.
 * It prevents issues like password truncation at special characters.
 */

/**
 * Properly encodes MongoDB connection string to handle special characters
 * @param {string} uri - The original MongoDB connection URI
 * @returns {string} - The properly encoded URI
 */
function encodeMongoDBUri(uri) {
  if (!uri) return uri;
  
  try {
    // Extract parts from the URI
    const matches = uri.match(/^(mongodb:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (!matches) return uri;
    
    const [, protocol, username, password, rest] = matches;
    
    // Encode username and password
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    
    // Debug logging if different
    if (password !== encodedPassword) {
      console.log(`MongoDB password encoding: Original length ${password.length}, Encoded length ${encodedPassword.length}`);
    }
    
    // Reconstruct the URI with encoded parts
    return `${protocol}${encodedUsername}:${encodedPassword}@${rest}`;
  } catch (error) {
    console.error("Error encoding MongoDB URI:", error);
    return uri; // Return original if encoding fails
  }
}

module.exports = { encodeMongoDBUri };
EOF

# Create an injection script to modify database connections
echo "Creating database connection modifier..."
cat > scripts/inject-mongo-encoder.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Potential database connection file paths
const dbFilePaths = [
  'src/lib/db.js',
  'src/lib/db.ts',
  'src/lib/mongodb.js',
  'src/lib/mongodb.ts',
  'src/utils/db.js',
  'src/utils/db.ts',
  'src/server/db/connection.js',
  'src/server/db/connection.ts',
  'src/database/connection.js',
  'src/database/connection.ts',
  'lib/db.js',
  'lib/db.ts',
  'lib/mongodb.js',
  'lib/mongodb.ts',
  'utils/db.js',
  'utils/db.ts',
];

// Find the first existing database connection file
let dbFilePath = null;
for (const filePath of dbFilePaths) {
  if (fs.existsSync(filePath)) {
    dbFilePath = filePath;
    break;
  }
}

if (!dbFilePath) {
  console.log('Could not find database connection file.');
  console.log('Please manually add the URL encoder to your database connection file.');
  process.exit(1);
}

console.log(`Found database connection file: ${dbFilePath}`);

// Read the file content
const content = fs.readFileSync(dbFilePath, 'utf8');

// Check if the file already imports the URL encoder
if (content.includes('encodeMongoDBUri') || content.includes('url-encode-mongodb')) {
  console.log('File already imports URL encoder. No changes needed.');
  process.exit(0);
}

// Determine the relative path to the URL encoder
const relativePath = path.relative(path.dirname(dbFilePath), 'src/lib').replace(/\\/g, '/');
const importPath = relativePath ? `${relativePath}/url-encode-mongodb` : './url-encode-mongodb';

// Determine if the file uses CommonJS or ES modules
const isESModule = content.includes('import ') || content.includes('export ');

let updatedContent;

if (isESModule) {
  // Add import for ES modules
  updatedContent = `import { encodeMongoDBUri } from '${importPath}';\n${content}`;
  
  // Replace connection string with encoded version
  updatedContent = updatedContent.replace(
    /(mongoose\.connect\()([^)]+)(\))/g,
    '$1encodeMongoDBUri($2)$3'
  );
  
  updatedContent = updatedContent.replace(
    /(new MongoClient\()([^)]+)(\))/g,
    '$1encodeMongoDBUri($2)$3'
  );
} else {
  // Add require for CommonJS
  updatedContent = `const { encodeMongoDBUri } = require('${importPath}');\n${content}`;
  
  // Replace connection string with encoded version
  updatedContent = updatedContent.replace(
    /(mongoose\.connect\()([^)]+)(\))/g,
    '$1encodeMongoDBUri($2)$3'
  );
  
  updatedContent = updatedContent.replace(
    /(new MongoClient\()([^)]+)(\))/g,
    '$1encodeMongoDBUri($2)$3'
  );
}

// Write the updated content back to the file
fs.writeFileSync(dbFilePath, updatedContent);

console.log(`Updated ${dbFilePath} to properly encode MongoDB connection strings.`);
EOF

# Create a testing script for the custom encoder
echo "Creating encoder test script..."
cat > scripts/test-encoder.js << 'EOF'
// Test the MongoDB URL encoder with various special characters
const { encodeMongoDBUri } = require('../src/lib/url-encode-mongodb');

// Test cases with special characters
const testCases = [
  {
    name: "Simple password",
    uri: "mongodb://admin:password@mongodb:27017/ai_project_planner?authSource=admin"
  },
  {
    name: "Password with W (capital letter)",
    uri: "mongodb://admin:eproglW5rtgph744@mongodb:27017/ai_project_planner?authSource=admin"
  },
  {
    name: "Password with @",
    uri: "mongodb://admin:pass@word@mongodb:27017/ai_project_planner?authSource=admin"
  },
  {
    name: "Password with $",
    uri: "mongodb://admin:pass$word@mongodb:27017/ai_project_planner?authSource=admin"
  },
  {
    name: "Password with #",
    uri: "mongodb://admin:pass#word@mongodb:27017/ai_project_planner?authSource=admin"
  },
  {
    name: "Password with multiple special chars",
    uri: "mongodb://admin:p@$$w#rd!@mongodb:27017/ai_project_planner?authSource=admin"
  }
];

// Run the tests
console.log("=== MongoDB URL Encoder Tests ===\n");

testCases.forEach(testCase => {
  console.log(`Test: ${testCase.name}`);
  console.log(`Original: ${testCase.uri}`);
  
  const encoded = encodeMongoDBUri(testCase.uri);
  console.log(`Encoded: ${encoded}`);
  
  // Extract password from both URIs for comparison
  const originalPassword = testCase.uri.match(/mongodb:\/\/[^:]+:([^@]+)@/)[1];
  const encodedPassword = encoded.match(/mongodb:\/\/[^:]+:([^@]+)@/)[1];
  
  console.log(`Original password: ${originalPassword}`);
  console.log(`Encoded password: ${encodedPassword}`);
  console.log(`Original length: ${originalPassword.length}, Encoded length: ${encodedPassword.length}`);
  console.log("");
});
EOF

# Create a direct patching script
echo "Creating direct patching script..."
cat > scripts/direct-db-patch.js << 'EOF'
/**
 * This script directly modifies database connection code to fix password truncation
 * by adding proper URL encoding.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to find database connection files
function findDatabaseFiles() {
  try {
    // Find files that might connect to MongoDB
    const command = 'find src -type f -name "*.js" -o -name "*.ts" | xargs grep -l "mongoose\\.connect\\|new MongoClient" 2>/dev/null';
    const result = execSync(command, { encoding: 'utf8' });
    return result.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error finding database files:', error.message);
    return [];
  }
}

// Patch MongoDB connection to use URL encoding
function patchFile(filePath) {
  console.log(`Examining ${filePath}...`);
  
  // Read file content
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Look for MongoDB connection patterns
  const mongoosePattern = /mongoose\.connect\(\s*['"`]mongodb:\/\/([^:]+):([^@]+)@([^'"`]+)['"`]/g;
  const clientPattern = /new MongoClient\(\s*['"`]mongodb:\/\/([^:]+):([^@]+)@([^'"`]+)['"`]/g;
  const envPattern = /mongoose\.connect\(\s*(process\.env\.[A-Z_]+)/g;
  const envClientPattern = /new MongoClient\(\s*(process\.env\.[A-Z_]+)/g;
  
  // Check if file uses MongoDB connections
  const usesMongoDB = mongoosePattern.test(content) || 
                     clientPattern.test(content) || 
                     envPattern.test(content) || 
                     envClientPattern.test(content);
  
  if (!usesMongoDB) {
    console.log(`No MongoDB connections found in ${filePath}`);
    return false;
  }
  
  // Reset RegExp lastIndex
  mongoosePattern.lastIndex = 0;
  clientPattern.lastIndex = 0;
  envPattern.lastIndex = 0;
  envClientPattern.lastIndex = 0;
  
  // Create encoder function to insert in the file
  const encoderFunction = `
// MongoDB URL encoder function to prevent password truncation
function encodeMongoDBUri(uri) {
  if (!uri) return uri;
  try {
    const matches = uri.match(/^(mongodb:\\/\\/)([^:]+):([^@]+)@(.+)$/);
    if (!matches) return uri;
    const [, protocol, username, password, rest] = matches;
    return \`\${protocol}\${encodeURIComponent(username)}:\${encodeURIComponent(password)}@\${rest}\`;
  } catch (error) {
    console.error("Error encoding MongoDB URI:", error);
    return uri;
  }
}
`;
  
  // Modify the content
  let updatedContent = content;
  
  // Add encoder function if not already present
  if (!updatedContent.includes('encodeMongoDBUri')) {
    // Find a good place to insert the function
    const functionInsertPoint = updatedContent.search(/const|let|var|import|function|class/);
    if (functionInsertPoint !== -1) {
      updatedContent = updatedContent.slice(0, functionInsertPoint) + encoderFunction + updatedContent.slice(functionInsertPoint);
    } else {
      updatedContent = encoderFunction + updatedContent;
    }
  }
  
  // Replace MongoDB connection strings with encoded versions
  updatedContent = updatedContent.replace(mongoosePattern, 'mongoose.connect(encodeMongoDBUri($&)');
  updatedContent = updatedContent.replace(clientPattern, 'new MongoClient(encodeMongoDBUri($&)');
  
  // Handle environment variable based connections
  updatedContent = updatedContent.replace(envPattern, 'mongoose.connect(encodeMongoDBUri($1)');
  updatedContent = updatedContent.replace(envClientPattern, 'new MongoClient(encodeMongoDBUri($1)');
  
  // Check if content was modified
  if (updatedContent === content) {
    console.log(`No changes needed for ${filePath}`);
    return false;
  }
  
  // Create backup of original file
  fs.writeFileSync(`${filePath}.bak`, content);
  console.log(`Created backup at ${filePath}.bak`);
  
  // Write updated content
  fs.writeFileSync(filePath, updatedContent);
  console.log(`✅ Updated ${filePath} with URL encoding fix`);
  
  return true;
}

// Main function
function main() {
  console.log("=== MongoDB Password Truncation Direct Fix ===");
  
  // Find database files
  const dbFiles = findDatabaseFiles();
  
  if (dbFiles.length === 0) {
    console.log("No MongoDB connection files found. Looking in common locations...");
    const commonLocations = [
      'src/lib/db.js', 'src/lib/db.ts',
      'src/utils/db.js', 'src/utils/db.ts',
      'src/models/db.js', 'src/models/db.ts',
      'src/server/database.js', 'src/server/database.ts',
      'lib/db.js', 'lib/db.ts'
    ];
    
    for (const location of commonLocations) {
      if (fs.existsSync(location)) {
        dbFiles.push(location);
      }
    }
  }
  
  if (dbFiles.length === 0) {
    console.log("Could not find any database connection files. Please manually add URL encoding to your MongoDB connections.");
    return;
  }
  
  console.log(`Found ${dbFiles.length} potential database files:`);
  dbFiles.forEach(file => console.log(`- ${file}`));
  
  let patchedFiles = 0;
  
  // Patch each file
  for (const file of dbFiles) {
    const patched = patchFile(file);
    if (patched) patchedFiles++;
  }
  
  if (patchedFiles > 0) {
    console.log(`\n✅ Successfully patched ${patchedFiles} files to fix MongoDB password truncation.`);
    console.log("You should rebuild and restart your application for changes to take effect.");
  } else {
    console.log("\nNo files were patched. Your MongoDB connections may already be properly encoded.");
  }
}

// Run the main function
main();
EOF

# Instructions for the user
echo "=== MongoDB Password Truncation Fix ===\n"
echo "The MongoDB password is being truncated at 'W' because 'W' is not being URL-encoded."
echo "This script provides several tools to diagnose and fix the issue.\n"

echo "Step 1: Check how passwords are being processed"
echo "   docker exec -it ai-project-planner-app-1 node scripts/check-password-encoding.js\n"

echo "Step 2: Test the URL encoder with your password"
echo "   docker exec -it ai-project-planner-app-1 node scripts/test-encoder.js\n"

echo "Step 3: Fix the database connection code (direct approach)"
echo "   docker exec -it ai-project-planner-app-1 node scripts/direct-db-patch.js\n"

echo "Step 4: Rebuild and restart the application"
echo "   docker-compose down"
echo "   docker-compose up -d --build\n"

echo "The issue is that special characters in your MongoDB password need to be URL-encoded."
echo "Without proper encoding, characters like '@', ':', '/', and even capital letters can cause the password to be truncated."
echo "The scripts provided will add proper URL encoding to prevent this issue."

echo "\nDetected password truncation:"
echo "Full password: eproglW5rtgph744"
echo "Truncated to: eprogl"
echo "The truncation happens at 'W' because it needs to be URL-encoded in the MongoDB connection string."