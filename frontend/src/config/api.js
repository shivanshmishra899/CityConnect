const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-api.onrender.com/api'
  : 'http://localhost:5000/api';

export { API_BASE_URL };