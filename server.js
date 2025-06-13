const dotenv = require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { foodDeliveryPool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Database configuration for authentication
const authPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'AyushAnand@123',
  database: 'auth_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Database configuration for food delivery service
const foodServicePool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'AyushAnand@123',
  database: process.env.DB_NAME || 'food_delivery_service',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'quick-bite-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'quick-bite-secret-key-2024';

// Middleware to verify JWT token
const requireAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Routes
app.get('/', (req, res) => {
  console.log('Root route accessed');
  if (req.session.userId) {
    console.log('User is logged in, redirecting to index');
    res.redirect('/index.html');
  } else {
    console.log('User is not logged in, redirecting to login');
    res.redirect('/login.html');
  }
});

app.get('/login.html', (req, res) => {
  console.log('Login page accessed');
  if (req.session.userId) {
    console.log('User is already logged in, redirecting to index');
    res.redirect('/index.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.get('/signup.html', (req, res) => {
  console.log('Signup page accessed');
  if (req.session.userId) {
    console.log('User is already logged in, redirecting to index');
    res.redirect('/index.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
  }
});

app.get('/index.html', (req, res) => {
  console.log('Index page accessed');
  if (!req.session.userId) {
    console.log('User is not logged in, redirecting to login');
    res.redirect('/login.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/data_entry.html', (req, res) => {
  console.log('Data entry page accessed');
  if (!req.session.userId) {
    console.log('User is not logged in, redirecting to login');
    res.redirect('/login.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'data_entry.html'));
  }
});

// Password validation middleware
function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*]/.test(password);
  
  const errors = [];
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!hasNumber) {
    errors.push('Password must contain at least one number');
  }
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            const [users] = await connection.query(
                'SELECT * FROM AdminUsers WHERE Email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = users[0];
            const validPassword = await bcrypt.compare(password, user.PasswordHash);

            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate JWT token with consistent secret
            const token = jwt.sign(
                { id: user.AdminID, email: user.Email, userType: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({ token, userId: user.AdminID, userName: user.Name });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  const { email, name, password, phoneNo, address } = req.body;

  // Validate input fields
  if (!email || !name || !password || !phoneNo || !address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({ 
      error: 'Password validation failed',
      details: passwordValidation.errors
    });
  }

  let connection;
  try {
    // Create database connection
    connection = await foodDeliveryPool.getConnection();
    console.log('Database connection established');

    // Check if user already exists
    const [existingUsers] = await connection.query(
      'SELECT * FROM Customers WHERE Email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new user
    const [result] = await connection.query(
      'INSERT INTO Customers (Name, Email, PhoneNo, Address, PasswordHash) VALUES (?, ?, ?, ?, ?)',
      [name, email, phoneNo, address, hashedPassword]
    );
    console.log('User inserted successfully:', result.insertId);

    // Generate JWT token
    const token = jwt.sign(
      { id: result.insertId, email, userType: 'customer' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      userId: result.insertId, 
      userName: name,
      message: 'Registration successful'
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      error: 'An error occurred during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
      console.log('Database connection released');
    }
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  console.log('Logout requested');
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Failed to logout' });
    }
    console.log('User logged out successfully');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check authentication status
app.get('/api/check-auth', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ authenticated: false });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user details from database
    const connection = await foodDeliveryPool.getConnection();
    try {
      const [users] = await connection.query(
        'SELECT CustomerID, Name, Email FROM Customers WHERE CustomerID = ?',
        [decoded.id]
      );

      if (users.length === 0) {
        return res.status(401).json({ authenticated: false });
      }

      res.json({
        authenticated: true,
        userId: users[0].CustomerID,
        userName: users[0].Name,
        email: users[0].Email
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({ authenticated: false });
  }
});

// Generate SQL from natural language
async function generateSQLFromText(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  
  const fullPrompt = `
    You are an expert SQL translator for a food delivery service database. Convert the following natural language query into a valid MySQL SQL statement.
    
    Database schema:
    - Customers(CustomerID, Name, Email, PhoneNo, Address)
    - Orders(OrderID, CustomerID, RestaurantID, OrderDate, TotalAmount, Status)
    - OrderDetails(OrderDetailID, OrderID, MenuItemID, Quantity, Price)
    - MenuItems(MenuItemID, RestaurantID, Name, Description, Price)
    - Restaurants(RestaurantID, Name, PhoneNo, CuisineType, Address)
    - Payments(PaymentID, OrderID, TotalAmount, PaymentDate, PaymentMethod, PaymentStatus)
    - DeliveryStaff(StaffID, Name, PhoneNo, Availability)
    - Deliveries(DeliveryID, OrderID, StaffID, DeliveryTime, DeliveryStatus)
    
    Table Relationships:
    - Orders.CustomerID -> Customers.CustomerID
    - Orders.RestaurantID -> Restaurants.RestaurantID
    - OrderDetails.OrderID -> Orders.OrderID
    - OrderDetails.MenuItemID -> MenuItems.MenuItemID
    - Payments.OrderID -> Orders.OrderID
    - Deliveries.OrderID -> Orders.OrderID
    - Deliveries.StaffID -> DeliveryStaff.StaffID
    
    Examples:
    - "show all customers" -> "SELECT * FROM Customers"
    - "customers with order id 2" -> "SELECT c.* FROM Customers c JOIN Orders o ON c.CustomerID = o.CustomerID WHERE o.OrderID = 2"
    - "payment id of all customers" -> "SELECT c.CustomerID, c.Name, p.PaymentID, p.PaymentStatus FROM Customers c JOIN Orders o ON c.CustomerID = o.CustomerID JOIN Payments p ON o.OrderID = p.OrderID"
    - "total orders by customer" -> "SELECT c.Name, COUNT(o.OrderID) as TotalOrders FROM Customers c LEFT JOIN Orders o ON c.CustomerID = o.CustomerID GROUP BY c.CustomerID, c.Name"
    
    Important rules:
    1. Always use proper table names and column names
    2. Use appropriate SQL functions and operators
    3. Include proper JOIN conditions when needed
    4. Use table aliases for better readability
    5. For customer queries, always use the Customers table
    6. For payment queries, always join with the Payments table through Orders
    7. For order queries, always join with the Orders table
    
    Query: ${prompt}
    
    Respond ONLY with the SQL query, nothing else. The query should be valid MySQL syntax.
  `;

  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    const sqlQuery = text.trim();
    
    // Basic SQL validation
    if (!sqlQuery.toLowerCase().startsWith('select')) {
      throw new Error('Only SELECT queries are allowed for security reasons');
    }
    
    return sqlQuery;
  } catch (error) {
    console.error("Error generating SQL:", error);
    throw new Error("Failed to generate SQL query: " + error.message);
  }
}

// Query generation endpoint
app.post('/api/generate-query', requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        error: "Empty query",
        suggestion: "Please provide a valid natural language query"
      });
    }
    
    // Generate SQL from natural language
    const sqlQuery = await generateSQLFromText(prompt);
    
    // Execute the query
    const [results] = await foodDeliveryPool.query(sqlQuery);
    
    res.json({ 
      originalQuery: prompt,
      sqlQuery: sqlQuery,
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Query execution error:", err);
    res.status(500).json({ 
      error: "Query execution failed",
      details: err.message,
      suggestion: "Please try rephrasing your query or check if the requested data exists in the database"
    });
  }
});

// Add data endpoint
app.post('/api/add-data', async (req, res) => {
    const { table, data } = req.body;
    
    if (!table || !data) {
        return res.status(400).json({ error: 'Table and data are required' });
    }

    try {
        const connection = await foodDeliveryPool.getConnection();
        
        try {
            let query = '';
            let values = [];
            
            switch (table) {
                case 'customers':
                    // Get the next available CustomerID
                    const [maxIdResult] = await connection.query('SELECT MAX(CustomerID) as maxId FROM Customers');
                    const nextId = (maxIdResult[0].maxId || 0) + 1;
                    
                    query = 'INSERT INTO Customers (CustomerID, Name, Email, PhoneNo, Address) VALUES (?, ?, ?, ?, ?)';
                    values = [nextId, data.Name, data.Email, data.PhoneNo, data.Address];
                    break;
                    
                case 'resturants':
                    query = 'INSERT INTO Resturants (Name, PhoneNo, CuisineType, Address) VALUES (?, ?, ?, ?)';
                    values = [data.Name, data.PhoneNo, data.CuisineType, data.Address];
                    break;
                    
                case 'menu_items':
                    query = 'INSERT INTO MenuItems (ResturantID, Name, Description, Price) VALUES (?, ?, ?, ?)';
                    values = [data.ResturantID, data.Name, data.Description, data.Price];
                    break;
                    
                case 'orders':
                    query = 'INSERT INTO Orders (CustomerID, ResturantID, OrderDate, TotalAmount, Status) VALUES (?, ?, NOW(), ?, ?)';
                    values = [data.CustomerID, data.ResturantID, data.TotalAmount, data.Status];
                    break;
                    
                case 'order_details':
                    query = 'INSERT INTO OrderDetails (OrderID, MenuItemID, Quantity, Price) VALUES (?, ?, ?, ?)';
                    values = [data.OrderID, data.MenuItemID, data.Quantity, data.Price];
                    break;
                    
                case 'delivery_staff':
                    query = 'INSERT INTO DeliveryStaff (Name, PhoneNo, Availability) VALUES (?, ?, ?)';
                    values = [data.Name, data.PhoneNo, data.Availability];
                    break;
                    
                case 'deliveries':
                    query = 'INSERT INTO Deliveries (OrderID, StaffID, DeliveryTime, DeliveryStatus) VALUES (?, ?, NOW(), ?)';
                    values = [data.OrderID, data.StaffID, data.DeliveryStatus];
                    break;
                    
                case 'payments':
                    query = 'INSERT INTO Payments (OrderID, TotalAmount, PaymentDate, PaymentMethod, PaymentStatus) VALUES (?, ?, NOW(), ?, ?)';
                    values = [data.OrderID, data.TotalAmount, data.PaymentMethod, data.PaymentStatus];
                    break;
                    
                default:
                    throw new Error('Invalid table name');
            }
            
            const [result] = await connection.execute(query, values);
            res.json({ success: true, id: result.insertId });
            
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error adding data:', error);
        res.status(500).json({ error: 'Failed to add data', details: error.message });
    }
});

// Admin registration endpoint
app.post('/api/admin/signup', async (req, res) => {
  const { email, password, name } = req.body;

  // Validate input fields
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    return res.status(400).json({ 
      error: 'Password validation failed',
      details: passwordValidation.errors
    });
  }

  let connection;
  try {
    // Create database connection
    connection = await foodDeliveryPool.getConnection();
    console.log('Database connection established');

    // Check if admin already exists
    const [existingAdmins] = await connection.query(
      'SELECT * FROM AdminUsers WHERE Email = ?',
      [email]
    );

    if (existingAdmins.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Get the next available AdminID
    const [maxIdResult] = await connection.query('SELECT MAX(AdminID) as maxId FROM AdminUsers');
    const nextId = (maxIdResult[0].maxId || 0) + 1;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Insert new admin
    const [result] = await connection.query(
      'INSERT INTO AdminUsers (AdminID, Name, Email, PasswordHash) VALUES (?, ?, ?, ?)',
      [nextId, name, email, hashedPassword]
    );
    console.log('Admin inserted successfully:', nextId);

    // Generate JWT token
    const token = jwt.sign(
      { id: nextId, email, userType: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    console.log('JWT token generated');

    res.json({ 
      token, 
      userId: nextId, 
      userName: name,
      message: 'Admin registration successful'
    });

  } catch (error) {
    console.error('Admin signup error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState
    });

    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'Database table not found. Please contact support.' });
    }
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: 'Database connection failed. Please try again later.' });
    }

    res.status(500).json({ 
      error: 'An error occurred during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
      console.log('Database connection released');
    }
  }
});

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  let connection;
  try {
    connection = await foodDeliveryPool.getConnection();
    console.log('Database connection established');

    // Get admin by email
    const [admins] = await connection.query(
      'SELECT * FROM AdminUsers WHERE Email = ?',
      [email]
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = admins[0];
    const validPassword = await bcrypt.compare(password, admin.PasswordHash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin.AdminID, email: admin.Email, userType: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      userId: admin.AdminID, 
      userName: admin.Name,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  } finally {
    if (connection) {
      connection.release();
      console.log('Database connection released');
    }
  }
});

// Initialize database
async function initializeDatabase() {
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            // Drop existing tables in correct order to handle foreign key constraints
            await connection.query('DROP TABLE IF EXISTS Payments');
            await connection.query('DROP TABLE IF EXISTS Deliveries');
            await connection.query('DROP TABLE IF EXISTS DeliveryStaff');
            await connection.query('DROP TABLE IF EXISTS OrderDetails');
            await connection.query('DROP TABLE IF EXISTS Orders');
            await connection.query('DROP TABLE IF EXISTS MenuItems');
            await connection.query('DROP TABLE IF EXISTS Resturants');
            await connection.query('DROP TABLE IF EXISTS Customers');
            console.log('All tables dropped successfully');

            // Create Customers table with exact schema
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

            // Create Restaurants table with exact schema
            await connection.query(`
                CREATE TABLE Resturants (
                    ResturantID INT NOT NULL UNIQUE,
                    Name VARCHAR(20) NOT NULL,
                    PhoneNo VARCHAR(15) NOT NULL,
                    CuisineType VARCHAR(20) NOT NULL,
                    Address VARCHAR(30) NOT NULL,
                    PRIMARY KEY (ResturantID)
                )
            `);
            console.log('Restaurants table created');

            // Create MenuItems table with exact schema
            await connection.query(`
                CREATE TABLE MenuItems (
                    MenuItemID INT NOT NULL UNIQUE,
                    ResturantID INT NOT NULL,
                    Name VARCHAR(20) NOT NULL,
                    Description TEXT,
                    Price DECIMAL(10, 2) NOT NULL,
                    PRIMARY KEY (MenuItemID),
                    FOREIGN KEY (ResturantID) REFERENCES Resturants(ResturantID)
                )
            `);
            console.log('MenuItems table created');

            // Create Orders table with exact schema
            await connection.query(`
                CREATE TABLE Orders (
                    OrderID INT NOT NULL UNIQUE,
                    CustomerID INT NOT NULL,
                    ResturantID INT NOT NULL,
                    OrderDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    TotalAmount DECIMAL(10, 2) NOT NULL,
                    Status VARCHAR(20) DEFAULT 'Pending',
                    PRIMARY KEY (OrderID),
                    FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID),
                    FOREIGN KEY (ResturantID) REFERENCES Resturants(ResturantID)
                )
            `);
            console.log('Orders table created');

            // Create OrderDetails table with exact schema
            await connection.query(`
                CREATE TABLE OrderDetails (
                    OrderDetailID INT NOT NULL UNIQUE,
                    OrderID INT NOT NULL,
                    MenuItemID INT NOT NULL,
                    Quantity INT NOT NULL,
                    Price DECIMAL(10, 2) NOT NULL,
                    PRIMARY KEY (OrderDetailID),
                    FOREIGN KEY (OrderID) REFERENCES Orders(OrderID),
                    FOREIGN KEY (MenuItemID) REFERENCES MenuItems(MenuItemID)
                )
            `);
            console.log('OrderDetails table created');

            // Create DeliveryStaff table with exact schema
            await connection.query(`
                CREATE TABLE DeliveryStaff (
                    StaffID INT NOT NULL UNIQUE,
                    Name VARCHAR(20) NOT NULL,
                    PhoneNo VARCHAR(15) NOT NULL,
                    Availability VARCHAR(10) DEFAULT 'Available',
                    PRIMARY KEY (StaffID)
                )
            `);
            console.log('DeliveryStaff table created');

            // Create Deliveries table with exact schema
            await connection.query(`
                CREATE TABLE Deliveries (
                    DeliveryID INT NOT NULL UNIQUE,
                    OrderID INT NOT NULL,
                    StaffID INT NOT NULL,
                    DeliveryTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    DeliveryStatus VARCHAR(10) DEFAULT 'Pending',
                    PRIMARY KEY (DeliveryID),
                    FOREIGN KEY (OrderID) REFERENCES Orders(OrderID),
                    FOREIGN KEY (StaffID) REFERENCES DeliveryStaff(StaffID)
                )
            `);
            console.log('Deliveries table created');

            // Create Payments table with exact schema
            await connection.query(`
                CREATE TABLE Payments (
                    PaymentID INT NOT NULL UNIQUE,
                    OrderID INT NOT NULL,
                    TotalAmount DECIMAL(10, 2) NOT NULL,
                    PaymentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PaymentMethod VARCHAR(30),
                    PaymentStatus VARCHAR(30),
                    PRIMARY KEY (PaymentID),
                    FOREIGN KEY (OrderID) REFERENCES Orders(OrderID)
                )
            `);
            console.log('Payments table created');

            // Insert sample data for Customers
            await connection.query(`
                INSERT INTO Customers (CustomerID, Name, Email, PhoneNo, Address) VALUES
                (1, 'Ayush Anand', 'ayush.anand@gmail.com', '9876543210', 'Etawah, Uttar Pradesh'),
                (2, 'Saurav Sahil', 'saurav.sahil@gmail.com', '8765432109', 'Mirzapur, Uttar Pradesh'),
                (3, 'Rohit Kumar', 'rohit.kumar@gmail.com', '7654321098', 'Varanasi, Uttar Pradesh'),
                (4, 'Sahil Verma', 'sahil.verma@gmail.com', '6543210987', 'Aligarh, Uttar Pradesh'),
                (5, 'Anand Singh', 'anand.singh@gmail.com', '7432109876', 'Delhi'),
                (6, 'Priya Sharma', 'priya.sharma@gmail.com', '8321456709', 'Lucknow, Uttar Pradesh'),
                (7, 'Neha Gupta', 'neha.gupta@gmail.com', '9210345678', 'Kanpur, Uttar Pradesh')
            `);
            console.log('Sample customer data inserted');

            // Insert sample data for Restaurants
            await connection.query(`
                INSERT INTO Resturants (ResturantID, Name, PhoneNo, CuisineType, Address) VALUES
                (1, 'Ganga Ram', '9876543211', 'Indian', 'Connaught Place, Delhi'),
                (2, 'Raj Darbar', '8765432101', 'Indian', 'Assi Ghat, Varanasi'),
                (3, 'Sushi Place', '7654321091', 'Japanese', 'Cantonment, Mirzapur'),
                (4, 'Italian Bistro', '6543210981', 'Italian', 'Civil Lines, Etawah'),
                (5, 'Delhi Darbar', '7432109871', 'Indian', 'Chandni Chowk, Delhi'),
                (6, 'Punjabi Tadka', '8321456711', 'Indian', 'Gomti Nagar, Lucknow'),
                (7, 'Royal Kitchen', '9210345671', 'Indian', 'Mall Road, Kanpur')
            `);
            console.log('Sample restaurant data inserted');

            // Insert sample data for MenuItems
            await connection.query(`
                INSERT INTO MenuItems (MenuItemID, ResturantID, Name, Description, Price) VALUES
                (1, 1, 'Butter Chicken', 'Tandoori chicken in creamy tomato sauce', 250.00),
                (2, 1, 'Paneer Tikka', 'Grilled paneer with spices', 220.00),
                (3, 2, 'Biryani', 'Spiced rice with chicken', 300.00),
                (4, 2, 'Dal Makhani', 'Creamy black lentils', 180.00),
                (5, 3, 'Sushi Roll', 'Assorted sushi rolls', 350.00),
                (6, 4, 'Spaghetti Carbonara', 'Classic Italian pasta dish', 200.00),
                (7, 5, 'Chole Bhature', 'Spicy chickpeas with fried bread', 150.00)
            `);
            console.log('Sample menu items data inserted');

            // Insert sample data for Orders
            await connection.query(`
                INSERT INTO Orders (OrderID, CustomerID, ResturantID, OrderDate, TotalAmount, Status) VALUES
                (1, 1, 5, '2023-10-01 12:00:00', 500.00, 'Pending'),
                (2, 3, 2, '2023-10-02 13:30:00', 600.00, 'Completed'),
                (3, 3, 4, '2023-10-03 14:45:00', 700.00, 'Pending'),
                (4, 2, 4, '2023-10-04 15:15:00', 800.00, 'Completed'),
                (5, 2, 1, '2023-10-05 16:00:00', 900.00, 'Pending'),
                (6, 1, 3, '2023-10-06 17:30:00', 1000.00, 'Completed'),
                (7, 3, 4, '2023-10-07 18:45:00', 1100.00, 'Pending')
            `);
            console.log('Sample orders data inserted');

            // Insert sample data for OrderDetails
            await connection.query(`
                INSERT INTO OrderDetails (OrderDetailID, OrderID, MenuItemID, Quantity, Price) VALUES
                (1, 1, 1, 2, 250.00),
                (2, 1, 2, 1, 220.00),
                (3, 2, 3, 1, 300.00),
                (4, 3, 4, 2, 180.00),
                (5, 4, 5, 3, 350.00),
                (6, 5, 6, 2, 200.00),
                (7, 6, 7, 4, 150.00)
            `);
            console.log('Sample order details data inserted');

            // Insert sample data for DeliveryStaff
            await connection.query(`
                INSERT INTO DeliveryStaff (StaffID, Name, PhoneNo, Availability) VALUES
                (1, 'Ramesh', '9876543222', 'Available'),
                (2, 'Suresh', '8765432111', 'Available'),
                (3, 'Ram', '7654321000', 'Available'),
                (4, 'Shyam', '6543210999', 'Available'),
                (5, 'Mohan', '7432109888', 'Available'),
                (6, 'Raju', '8321456722', 'Available'),
                (7, 'Rahul', '9210345688', 'Available')
            `);
            console.log('Sample delivery staff data inserted');

            // Insert sample data for Deliveries
            await connection.query(`
                INSERT INTO Deliveries (DeliveryID, OrderID, StaffID, DeliveryTime, DeliveryStatus) VALUES
                (1, 1, 1, '2023-10-01 13:00:00', 'Pending'),
                (2, 2, 3, '2023-10-02 14:30:00', 'Completed'),
                (3, 3, 4, '2023-10-03 15:45:00', 'Pending'),
                (4, 4, 1, '2023-10-04 16:15:00', 'Completed'),
                (5, 5, 4, '2023-10-05 17:00:00', 'Pending'),
                (6, 6, 6, '2023-10-06 18:30:00', 'Completed'),
                (7, 7, 4, '2023-10-07 19:45:00', 'Pending')
            `);
            console.log('Sample deliveries data inserted');

            // Insert sample data for Payments
            await connection.query(`
                INSERT INTO Payments (PaymentID, OrderID, PaymentDate, PaymentMethod, TotalAmount, PaymentStatus) VALUES
                (1, 1, '2023-10-01 12:30:00', 'Credit Card', 500.00, 'Pending'),
                (2, 2, '2023-10-02 14:00:00', 'UPI', 600.00, 'Completed'),
                (3, 3, '2023-10-03 15:15:00', 'Cash', 700.00, 'Failed'),
                (4, 4, '2023-10-04 16:00:00', 'Debit Card', 800.00, 'Completed'),
                (5, 5, '2023-10-05 16:45:00', 'UPI', 900.00, 'Pending'),
                (6, 6, '2023-10-06 18:00:00', 'Credit Card', 1000.00, 'Completed'),
                (7, 7, '2023-10-07 19:15:00', 'Cash', 1100.00, 'Pending')
            `);
            console.log('Sample payments data inserted');

            // Add indexes for better performance
            await connection.query('CREATE INDEX idx_customer_email ON Customers(Email)');
            await connection.query('CREATE INDEX idx_order_customer ON Orders(CustomerID)');
            await connection.query('CREATE INDEX idx_order_restaurant ON Orders(ResturantID)');
            console.log('Indexes created');

            console.log('Database initialization completed successfully');
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Call initializeDatabase when server starts
initializeDatabase();

// Get data from a table
app.get('/api/get-data', requireAuth, async (req, res) => {
    const { table } = req.query;
    
    if (!table) {
        return res.status(400).json({ error: 'Table name is required' });
    }
    
    // Map lowercase table names to their correct case
    const tableNameMap = {
        'customers': 'Customers',
        'resturants': 'Resturants',
        'menu_items': 'MenuItems',
        'orders': 'Orders',
        'order_details': 'OrderDetails',
        'delivery_staff': 'DeliveryStaff',
        'deliveries': 'Deliveries',
        'payments': 'Payments'
    };
    
    const correctTableName = tableNameMap[table.toLowerCase()];
    if (!correctTableName) {
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            console.log(`Fetching data from table: ${correctTableName}`);
            const [rows] = await connection.query(`SELECT * FROM ${correctTableName}`);
            console.log(`Successfully fetched ${rows.length} records from ${correctTableName}`);
            res.json(rows);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch data',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Search data in a table
app.get('/api/search-data', requireAuth, async (req, res) => {
    const { table, term } = req.query;
    
    if (!table || !term) {
        return res.status(400).json({ error: 'Table name and search term are required' });
    }
    
    // Validate table name to prevent SQL injection
    const validTables = ['customers', 'resturants', 'menu_items', 'orders'];
    if (!validTables.includes(table)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            // Get column names for the table
            const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
            const columnNames = columns.map(col => col.Field);
            
            // Build search query dynamically based on column types
            let searchQuery = `SELECT * FROM ${table} WHERE `;
            const searchConditions = [];
            
            columnNames.forEach(column => {
                // Check column type to determine search method
                const columnType = columns.find(col => col.Field === column).Type;
                
                if (columnType.includes('char') || columnType.includes('text') || columnType.includes('varchar')) {
                    searchConditions.push(`${column} LIKE ?`);
                } else if (columnType.includes('int') || columnType.includes('decimal') || columnType.includes('float')) {
                    // For numeric columns, try exact match
                    if (!isNaN(term)) {
                        searchConditions.push(`${column} = ?`);
                    }
                }
            });
            
            if (searchConditions.length === 0) {
                return res.status(400).json({ error: 'No searchable columns found' });
            }
            
            searchQuery += searchConditions.join(' OR ');
            
            // Create search parameters
            const searchParams = searchConditions.map(() => `%${term}%`);
            
            const [rows] = await connection.query(searchQuery, searchParams);
            res.json(rows);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error searching data:', error);
        res.status(500).json({ error: 'Failed to search data' });
    }
});

// Get a single record by ID
app.get('/api/get-record', requireAuth, async (req, res) => {
    const { table, id } = req.query;
    
    if (!table || !id) {
        return res.status(400).json({ error: 'Table name and record ID are required' });
    }
    
    // Map table names to their correct case and ID columns
    const tableMap = {
        'customers': { name: 'Customers', idColumn: 'CustomerID' },
        'resturants': { name: 'Resturants', idColumn: 'ResturantID' },
        'menu_items': { name: 'MenuItems', idColumn: 'MenuItemID' },
        'orders': { name: 'Orders', idColumn: 'OrderID' },
        'order_details': { name: 'OrderDetails', idColumn: 'OrderDetailID' },
        'delivery_staff': { name: 'DeliveryStaff', idColumn: 'StaffID' },
        'deliveries': { name: 'Deliveries', idColumn: 'DeliveryID' },
        'payments': { name: 'Payments', idColumn: 'PaymentID' }
    };
    
    const tableInfo = tableMap[table.toLowerCase()];
    if (!tableInfo) {
        console.error(`Invalid table name: ${table}`);
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            console.log(`Fetching record from ${tableInfo.name} with ID ${id}`);
            const [rows] = await connection.query(
                `SELECT * FROM ${tableInfo.name} WHERE ${tableInfo.idColumn} = ?`, 
                [id]
            );
            
            if (rows.length === 0) {
                console.log(`No record found in ${tableInfo.name} with ID ${id}`);
                return res.status(404).json({ error: 'Record not found' });
            }
            
            console.log(`Successfully fetched record from ${tableInfo.name}`);
            res.json(rows[0]);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error fetching record:', error);
        res.status(500).json({ 
            error: 'Failed to fetch record',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update a record
app.post('/api/update-data', requireAuth, async (req, res) => {
    const { table, id, data } = req.body;
    
    if (!table || !id || !data) {
        return res.status(400).json({ error: 'Table name, record ID, and data are required' });
    }
    
    // Map table names to their ID columns
    const idColumnMap = {
        'customers': 'CustomerID',
        'resturants': 'ResturantID',
        'menu_items': 'MenuItemID',
        'orders': 'OrderID',
        'order_details': 'OrderDetailID',
        'delivery_staff': 'StaffID',
        'deliveries': 'DeliveryID',
        'payments': 'PaymentID'
    };
    
    const idColumn = idColumnMap[table];
    if (!idColumn) {
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            // Build update query dynamically
            const updateFields = Object.keys(data).map(key => `${key} = ?`);
            const updateQuery = `UPDATE ${table} SET ${updateFields.join(', ')} WHERE ${idColumn} = ?`;
            
            // Create parameters array
            const params = [...Object.values(data), id];
            
            const [result] = await connection.query(updateQuery, params);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Record not found' });
            }
            
            res.json({ success: true, message: 'Record updated successfully' });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating record:', error);
        res.status(500).json({ error: 'Failed to update record' });
    }
});

// Delete a record
app.post('/api/delete-data', requireAuth, async (req, res) => {
    const { table, id } = req.body;
    
    if (!table || !id) {
        return res.status(400).json({ error: 'Table name and record ID are required' });
    }
    
    // Map frontend table names to actual database table names
    const tableNameMap = {
        'customers': 'Customers',
        'resturants': 'Resturants',
        'menu_items': 'MenuItems',
        'orders': 'Orders',
        'order_details': 'OrderDetails',
        'delivery_staff': 'DeliveryStaff',
        'deliveries': 'Deliveries',
        'payments': 'Payments'
    };
    
    const dbTableName = tableNameMap[table];
    if (!dbTableName) {
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const connection = await foodDeliveryPool.getConnection();
        try {
            // Start a transaction
            await connection.beginTransaction();
            
            try {
                switch (table) {
                    case 'customers':
                        // First delete related records in OrderDetails through Orders
                        await connection.query(`
                            DELETE od FROM OrderDetails od
                            INNER JOIN Orders o ON od.OrderID = o.OrderID
                            WHERE o.CustomerID = ?
                        `, [id]);
                        
                        // Then delete orders
                        await connection.query('DELETE FROM Orders WHERE CustomerID = ?', [id]);
                        
                        // Finally delete the customer
                        const [customerResult] = await connection.query('DELETE FROM Customers WHERE CustomerID = ?', [id]);
                        
                        if (customerResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Customer not found' });
                        }
                        break;

                    case 'resturants':
                        // First delete related menu items
                        await connection.query('DELETE FROM MenuItems WHERE ResturantID = ?', [id]);
                        
                        // Then delete related orders
                        await connection.query('DELETE FROM Orders WHERE ResturantID = ?', [id]);
                        
                        // Finally delete the restaurant
                        const [restaurantResult] = await connection.query('DELETE FROM Resturants WHERE ResturantID = ?', [id]);
                        
                        if (restaurantResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Restaurant not found' });
                        }
                        break;

                    case 'menu_items':
                        // First delete related order details
                        await connection.query('DELETE FROM OrderDetails WHERE MenuItemID = ?', [id]);
                        
                        // Then delete the menu item
                        const [menuItemResult] = await connection.query('DELETE FROM MenuItems WHERE MenuItemID = ?', [id]);
                        
                        if (menuItemResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Menu item not found' });
                        }
                        break;

                    case 'orders':
                        // First delete related order details
                        await connection.query('DELETE FROM OrderDetails WHERE OrderID = ?', [id]);
                        
                        // Then delete related deliveries
                        await connection.query('DELETE FROM Deliveries WHERE OrderID = ?', [id]);
                        
                        // Then delete related payments
                        await connection.query('DELETE FROM Payments WHERE OrderID = ?', [id]);
                        
                        // Finally delete the order
                        const [orderResult] = await connection.query('DELETE FROM Orders WHERE OrderID = ?', [id]);
                        
                        if (orderResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Order not found' });
                        }
                        break;

                    case 'order_details':
                        const [orderDetailResult] = await connection.query('DELETE FROM OrderDetails WHERE OrderDetailID = ?', [id]);
                        
                        if (orderDetailResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Order detail not found' });
                        }
                        break;

                    case 'delivery_staff':
                        // First delete related deliveries
                        await connection.query('DELETE FROM Deliveries WHERE StaffID = ?', [id]);
                        
                        // Then delete the staff
                        const [staffResult] = await connection.query('DELETE FROM DeliveryStaff WHERE StaffID = ?', [id]);
                        
                        if (staffResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Delivery staff not found' });
                        }
                        break;

                    case 'deliveries':
                        const [deliveryResult] = await connection.query('DELETE FROM Deliveries WHERE DeliveryID = ?', [id]);
                        
                        if (deliveryResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Delivery not found' });
                        }
                        break;

                    case 'payments':
                        const [paymentResult] = await connection.query('DELETE FROM Payments WHERE PaymentID = ?', [id]);
                        
                        if (paymentResult.affectedRows === 0) {
                            await connection.rollback();
                            return res.status(404).json({ error: 'Payment not found' });
                        }
                        break;
                }
                
                await connection.commit();
                res.json({ success: true, message: 'Record deleted successfully' });
            } catch (error) {
                await connection.rollback();
                throw error;
            }
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting record:', error);
        res.status(500).json({ error: 'Failed to delete record', details: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log('\n=================================');
    console.log('🚀 Quick Bite Server Started!');
    console.log('=================================');
    console.log('📡 Server running at:');
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Network: http://${require('os').hostname()}:${PORT}`);
    console.log('=================================');
    console.log('📚 Available endpoints:');
    console.log('   - GET  /api/get-data');
    console.log('   - GET  /api/search-data');
    console.log('   - POST /api/signup');
    console.log('   - POST /api/login');
    console.log('   - POST /api/logout');
    console.log('=================================\n');
});



