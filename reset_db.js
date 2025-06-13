const mysql = require('mysql2/promise');
require('dotenv').config();

async function resetDatabase() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        const connection = await pool.getConnection();
        try {
            // Drop existing tables
            await connection.query('DROP TABLE IF EXISTS Payments');
            await connection.query('DROP TABLE IF EXISTS Deliveries');
            await connection.query('DROP TABLE IF EXISTS DeliveryStaff');
            await connection.query('DROP TABLE IF EXISTS OrderDetails');
            await connection.query('DROP TABLE IF EXISTS Orders');
            await connection.query('DROP TABLE IF EXISTS MenuItems');
            await connection.query('DROP TABLE IF EXISTS Restaurants');
            await connection.query('DROP TABLE IF EXISTS Customers');
            await connection.query('DROP TABLE IF EXISTS AdminUsers');
            console.log('All tables dropped successfully');

            // Create AdminUsers table
            await connection.query(`
                CREATE TABLE AdminUsers (
                    AdminID INT NOT NULL UNIQUE,
                    Name VARCHAR(20) NOT NULL,
                    Email VARCHAR(30) UNIQUE NOT NULL,
                    PasswordHash VARCHAR(255) NOT NULL,
                    PRIMARY KEY (AdminID)
                )
            `);
            console.log('AdminUsers table created');

            // Create Customers table
            await connection.query(`
                CREATE TABLE Customers (
                    CustomerID INT NOT NULL UNIQUE,
                    Name VARCHAR(20) NOT NULL,
                    Email VARCHAR(30) UNIQUE NOT NULL,
                    PhoneNo VARCHAR(20) NOT NULL,
                    Address VARCHAR(30) DEFAULT 'Not Provided',
                    PRIMARY KEY (CustomerID)
                )
            `);
            console.log('Customers table created');

            console.log('Database reset completed successfully');
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error resetting database:', error);
    } finally {
        await pool.end();
    }
}

resetDatabase(); 