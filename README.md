# Asset Management Backend API

Node.js/Express backend API for the Asset Management System.

## Features

- RESTful API endpoints
- JWT authentication
- Role-based authorization
- Supabase database integration
- File upload support
- Input validation with Joi
- Rate limiting and security middleware

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting
- **File Upload**: Multer

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account and project

### Installation

1. Navigate to the backend directory:

```bash
cd be
```

2. Install dependencies:

```bash
npm install
```

3. Create environment file:

```bash
cp .env.example .env
```

4. Update `.env` with your configuration:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=7d

# File Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=52428800
```

### Database Setup

Run the SQL schema in your Supabase SQL Editor:

```sql
-- Copy the contents of database_schema.sql and run in Supabase
```

### Running the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration (admin only)
- `GET /api/auth/profile` - Get current user profile

### Assets

- `GET /api/assets` - Get all assets (with filters & pagination)
- `GET /api/assets/:assetCode` - Get single asset
- `POST /api/assets` - Create new asset (admin/accountant)
- `PUT /api/assets/:assetCode` - Update asset (admin/accountant)
- `DELETE /api/assets/:assetCode` - Delete asset (admin only)
- `POST /api/assets/:assetCode/assign` - Assign asset to user
- `POST /api/assets/:assetCode/return` - Return asset from user

### Users

- `GET /api/users` - Get all users (admin/accountant)
- `GET /api/users/:employeeCode` - Get single user
- `POST /api/users` - Create new user (admin)
- `PUT /api/users/:employeeCode` - Update user
- `DELETE /api/users/:employeeCode` - Delete user (admin)
- `GET /api/users/:employeeCode/assets` - Get user's assigned assets

### Invoices

- `GET /api/invoices` - Get all invoices
- `POST /api/invoices` - Create invoice (admin/accountant)

### Maintenance

- `GET /api/maintenance` - Get maintenance tickets
- `POST /api/maintenance` - Create maintenance ticket
- `PUT /api/maintenance/:ticketId` - Update maintenance ticket

## Authentication

Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## User Roles

- **admin_it**: Full access to all features
- **accountant**: Can manage assets and invoices
- **dev**: Limited access (for development)
- **user**: Can only view their own assets and create maintenance tickets

## File Upload

The API supports file uploads for:

- Asset images
- Invoice documents
- Maintenance evidence photos

Files are uploaded to Supabase Storage.

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "field_name",
      "message": "Validation error message"
    }
  ]
}
```

## Development

### Project Structure

```
be/
├── config/           # Database configuration
├── middleware/       # Authentication, validation, etc.
├── routes/          # API route handlers
├── validation/      # Joi validation schemas
├── uploads/         # Temporary file uploads
├── .env            # Environment variables
├── package.json    # Dependencies
├── server.js       # Main application file
└── README.md       # This file
```

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests

## Deployment

1. Set environment variables in your deployment platform
2. Run database migrations if needed
3. Start the server with `npm start`

## Contributing

1. Follow the existing code style
2. Add validation for all inputs
3. Include error handling
4. Update documentation for new endpoints
5. Test your changes

## License

MIT License
