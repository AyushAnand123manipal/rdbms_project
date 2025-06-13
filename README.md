# Food Delivery Application

A full-stack food delivery application built with Node.js, Express, MySQL, and React.

## Features

- User authentication (signup/login)
- Restaurant listings and search
- Menu management
- Order placement and tracking
- Real-time order status updates
- Admin dashboard for restaurant owners

## Prerequisites

- Node.js (>=14.0.0)
- MySQL (>=8.0)
- npm or yarn

## Setup Instructions

1. Clone the repository:
```bash
git clone <repository-url>
cd food-delivery-app
```

2. Install dependencies:
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

3. Configure environment variables:
```bash
# Copy the example env file
cp .env.example .env

# Edit .env file with your configuration
```

4. Set up the database:
```bash
# Create a new MySQL database
mysql -u root -p
CREATE DATABASE food_delivery_db;
exit;

# The tables will be created automatically when you start the server
```

5. Start the application:
```bash
# Development mode (runs both server and client)
npm run dev

# Or run separately:
# Terminal 1 - Start the server
npm run server

# Terminal 2 - Start the client
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Documentation

### Authentication Endpoints

- POST /api/auth/signup - Register a new user
- POST /api/auth/login - User login
- GET /api/auth/me - Get current user profile

### Restaurant Endpoints

- GET /api/restaurants - Get all restaurants
- GET /api/restaurants/:id - Get restaurant details
- POST /api/restaurants - Create new restaurant (admin only)
- PUT /api/restaurants/:id - Update restaurant (admin only)

### Menu Endpoints

- GET /api/menu/:restaurantId - Get restaurant menu
- POST /api/menu - Add menu item (admin only)
- PUT /api/menu/:id - Update menu item (admin only)
- DELETE /api/menu/:id - Delete menu item (admin only)

### Order Endpoints

- POST /api/orders - Create new order
- GET /api/orders - Get user orders
- GET /api/orders/:id - Get order details
- PUT /api/orders/:id - Update order status

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 