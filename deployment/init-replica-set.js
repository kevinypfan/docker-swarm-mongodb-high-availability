// MongoDB Replica Set Initialization Script

// Wait for MongoDB to be ready
sleep(5000);

// Define replica set configuration
var config = {
    "_id": "rs0",
    "version": 1,
    "members": [
        {
            "_id": 0,
            "host": "mongodb-primary:27017",
            "priority": 2
        },
        {
            "_id": 1,
            "host": "mongodb-secondary1:27017",
            "priority": 1
        },
        {
            "_id": 2,
            "host": "mongodb-secondary2:27017",
            "priority": 1
        }
    ]
};

// Initialize replica set
try {
    print("Initializing replica set...");
    var result = rs.initiate(config);
    print("Replica set initialization result:", JSON.stringify(result));
    
    // Wait for replica set to be ready
    sleep(10000);
    
    // Check replica set status
    print("Checking replica set status...");
    var status = rs.status();
    print("Replica set status:", JSON.stringify(status));
    
    print("Replica set initialization completed successfully!");
} catch (error) {
    print("Error initializing replica set:", error);
}