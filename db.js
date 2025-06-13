const mysql = require('mysql2/promise');

// Create a connection pool
const foodDeliveryPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'AyushAnand@123',
    database: process.env.DB_NAME || 'food_delivery_service',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection
async function testConnection() {
    try {
        const connection = await foodDeliveryPool.getConnection();
        console.log('Database connection successful');
        connection.release();
    } catch (error) {
        console.error('Error connecting to the database:', error);
        process.exit(1);
    }
}

// Initialize database schema
async function initializeDatabase() {
    try {
        const connection = await foodDeliveryPool.getConnection();
        
        // Read and execute schema.sql
        const fs = require('fs');
        const path = require('path');
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        
        // Split the schema into individual statements
        const statements = schema.split(';').filter(stmt => stmt.trim());
        
        // Execute each statement
        for (const statement of statements) {
            if (statement.trim()) {
                await connection.query(statement);
            }
        }
        
        console.log('Database schema initialized successfully');
        connection.release();
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

module.exports = {
    foodDeliveryPool,
    testConnection,
    initializeDatabase
}; 