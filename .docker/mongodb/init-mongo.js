db = db.getSiblingDB('ai_project_planner');

// Create Users collection with validation
db.createCollection("users", {
   validator: {
     $jsonSchema: {
       bsonType: "object",
       required: ["nickname", "email", "password", "createdAt", "lastLogin"],
       properties: {
         nickname: {
           bsonType: "string",
           description: "must be a string and is required"
         },
         email: {
           bsonType: "string",
           pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
           description: "must be a valid email address and is required"
         },
         password: {
           bsonType: "string",
           description: "must be a string and is required"
         },
         createdAt: {
           bsonType: "date",
           description: "must be a date and is required"
         },
         lastLogin: {
           bsonType: ["date", "null"],
           description: "must be either a date or null"
         }
       }
     }
   },
   validationLevel: "strict"
 });

// Create indexes for Users
db.users.createIndex({ "nickname": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });

// Create Projects collection with validation
db.createCollection("projects", {
   validator: {
      $jsonSchema: {
         bsonType: "object",
         required: ["userId", "name", "description"],
         properties: {
            userId: {
               bsonType: "objectId",
               description: "must be an objectId and is required"
            },
            name: {
               bsonType: "string",
               description: "must be a string and is required"
            },
            description: {
               bsonType: "string",
               description: "must be a string and is required"
            },
            rootTaskId: {
               bsonType: ["objectId", "null"],
               description: "must be an objectId or null"
            },
            createdAt: {
               bsonType: "date",
               description: "must be a date"
            },
            updatedAt: {
               bsonType: "date",
               description: "must be a date"
            }
         }
      }
   }
});

// Create indexes for Projects
db.projects.createIndex({ "userId": 1 });
db.projects.createIndex({ "createdAt": 1 });

// Create Tasks collection with validation
db.createCollection("tasks", {
   validator: {
      $jsonSchema: {
         bsonType: "object",
         required: ["projectId", "name", "description"],
         properties: {
            projectId: {
               bsonType: "objectId",
               description: "must be an objectId and is required"
            },
            parentId: {
               bsonType: ["objectId", "null"],
               description: "must be an objectId or null"
            },
            name: {
               bsonType: "string",
               description: "must be a string and is required"
            },
            description: {
               bsonType: "string",
               description: "must be a string and is required"
            },
            position: {
               bsonType: "object",
               required: ["x", "y"],
               properties: {
                  x: {
                     bsonType: "number",
                     description: "must be a number"
                  },
                  y: {
                     bsonType: "number",
                     description: "must be a number"
                  }
               }
            },
            childrenCount: {
               bsonType: "number",
               description: "must be a number"
            },
            descendantCount: {
               bsonType: "number",
               description: "must be a number"
            },
            createdAt: {
               bsonType: "date",
               description: "must be a date"
            },
            updatedAt: {
               bsonType: "date",
               description: "must be a date"
            }
         }
      }
   }
});

// Create compound index for Tasks
db.tasks.createIndex({ "projectId": 1, "parentId": 1 });

// Verify collections were created
print("Collections in database:");
db.getCollectionNames().forEach(printjson);

// Verify indexes
print("\nIndexes for users collection:");
db.users.getIndexes().forEach(printjson);

print("\nIndexes for projects collection:");
db.projects.getIndexes().forEach(printjson);

print("\nIndexes for tasks collection:");
db.tasks.getIndexes().forEach(printjson);

// Create admin user (for development only)
db.createUser({
    user: "admin",
    pwd: "devpassword",
    roles: [{ role: "readWrite", db: "ai_project_planner" }]
});
