// server.js - Main backend server file
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Express app
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token verification failed' });
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CityConnect API is running' });
});

// Auth routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, phone, role } = req.body;

    // Validate input
    if (!email || !password || !name || !phone || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['traveller', 'staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create user profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .insert([
        {
          id: authData.user.id,
          email,
          name,
          phone,
          role,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      .select();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    res.status(201).json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name,
        role
      },
      session: authData.session
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Sign in with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }

    res.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name: profileData.name,
        role: profileData.role
      },
      session: authData.session
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vehicle routes
app.get('/api/vehicles', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        current_location:vehicle_locations(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Vehicles fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch vehicles' });
    }

    // Format response with current location data
    const vehicles = data.map(vehicle => ({
      id: vehicle.id,
      number: vehicle.vehicle_number,
      route: vehicle.route_name,
      status: vehicle.status,
      capacity: vehicle.capacity,
      type: vehicle.vehicle_type,
      lat: vehicle.current_location[0]?.latitude || null,
      lng: vehicle.current_location[0]?.longitude || null,
      lastUpdated: vehicle.current_location[0]?.updated_at || null,
      nextStop: vehicle.next_stop,
      eta: vehicle.eta
    }));

    res.json(vehicles);

  } catch (error) {
    console.error('Vehicles API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/vehicles/:id/location', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('vehicle_locations')
      .select('*')
      .eq('vehicle_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Location fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch vehicle location' });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Vehicle location not found' });
    }

    res.json({
      vehicleId: id,
      latitude: data[0].latitude,
      longitude: data[0].longitude,
      timestamp: data[0].created_at,
      speed: data[0].speed,
      heading: data[0].heading
    });

  } catch (error) {
    console.error('Location API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Staff only: Update vehicle location
app.post('/api/vehicles/:id/location', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, speed = 0, heading = 0 } = req.body;

    // Check if user is staff
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (profileData.role !== 'staff') {
      return res.status(403).json({ error: 'Only staff can update vehicle locations' });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Insert new location record
    const { data, error } = await supabase
      .from('vehicle_locations')
      .insert([
        {
          vehicle_id: id,
          latitude,
          longitude,
          speed,
          heading,
          updated_by: req.user.id,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      .select();

    if (error) {
      console.error('Location update error:', error);
      return res.status(500).json({ error: 'Failed to update vehicle location' });
    }

    // Update vehicle status to active
    await supabase
      .from('vehicles')
      .update({ 
        status: 'active',
        updated_at: new Date()
      })
      .eq('id', id);

    res.json({
      success: true,
      location: {
        vehicleId: id,
        latitude,
        longitude,
        timestamp: data[0].created_at
      }
    });

  } catch (error) {
    console.error('Location update API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ticket routes
app.post('/api/tickets/book', authenticateToken, async (req, res) => {
  try {
    const { vehicleId, fromLocation, toLocation, fare } = req.body;

    if (!vehicleId || !fromLocation || !toLocation || !fare) {
      return res.status(400).json({ error: 'All booking details are required' });
    }

    // Get user profile
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (profileData.role !== 'traveller') {
      return res.status(403).json({ error: 'Only travellers can book tickets' });
    }

    // Get vehicle details
    const { data: vehicleData } = await supabase
      .from('vehicles')
      .select('vehicle_number, route_name')
      .eq('id', vehicleId)
      .single();

    // Generate ticket ID
    const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create ticket
    const { data, error } = await supabase
      .from('tickets')
      .insert([
        {
          ticket_id: ticketId,
          user_id: req.user.id,
          vehicle_id: vehicleId,
          from_location: fromLocation,
          to_location: toLocation,
          fare_amount: fare,
          booking_status: 'confirmed',
          travel_date: new Date().toISOString().split('T')[0],
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      .select();

    if (error) {
      console.error('Ticket booking error:', error);
      return res.status(500).json({ error: 'Failed to book ticket' });
    }

    res.status(201).json({
      success: true,
      ticket: {
        id: ticketId,
        vehicleNumber: vehicleData.vehicle_number,
        route: vehicleData.route_name,
        from: fromLocation,
        to: toLocation,
        fare: fare,
        bookedAt: data[0].created_at,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('Ticket booking API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        vehicle:vehicles(vehicle_number, route_name)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Tickets fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch tickets' });
    }

    const tickets = data.map(ticket => ({
      id: ticket.ticket_id,
      vehicleNumber: ticket.vehicle.vehicle_number,
      route: ticket.vehicle.route_name,
      from: ticket.from_location,
      to: ticket.to_location,
      fare: ticket.fare_amount,
      bookedAt: ticket.created_at,
      travelDate: ticket.travel_date,
      status: ticket.booking_status
    }));

    res.json(tickets);

  } catch (error) {
    console.error('Tickets API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Transport planning routes
app.get('/api/routes/plan', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'From and to locations are required' });
    }

    // Simple route planning - in production, integrate with mapping services
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('status', 'active');

    if (error) {
      console.error('Route planning error:', error);
      return res.status(500).json({ error: 'Failed to fetch routes' });
    }

    // Filter routes that might serve the requested journey
    const relevantRoutes = data.filter(vehicle => 
      vehicle.route_name.toLowerCase().includes(from.toLowerCase()) ||
      vehicle.route_name.toLowerCase().includes(to.toLowerCase())
    );

    const routes = relevantRoutes.map(vehicle => ({
      id: vehicle.id,
      vehicleNumber: vehicle.vehicle_number,
      route: vehicle.route_name,
      type: vehicle.vehicle_type,
      estimatedFare: vehicle.base_fare || 20,
      estimatedDuration: '25-30 mins',
      nextDeparture: '5 mins'
    }));

    res.json({
      from,
      to,
      routes,
      totalOptions: routes.length
    });

  } catch (error) {
    console.error('Route planning API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Staff dashboard stats
app.get('/api/staff/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user is staff
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (profileData.role !== 'staff') {
      return res.status(403).json({ error: 'Only staff can access these stats' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Get today's ticket stats
    const { data: ticketStats, error: ticketError } = await supabase
      .from('tickets')
      .select('fare_amount')
      .gte('created_at', today + 'T00:00:00')
      .lt('created_at', today + 'T23:59:59');

    if (ticketError) {
      console.error('Ticket stats error:', ticketError);
    }

    const totalPassengers = ticketStats?.length || 0;
    const totalRevenue = ticketStats?.reduce((sum, ticket) => sum + ticket.fare_amount, 0) || 0;

    // Get active vehicles count
    const { count: activeVehicles } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact' })
      .eq('status', 'active');

    res.json({
      todayStats: {
        passengers: totalPassengers,
        revenue: totalRevenue,
        trips: Math.floor(totalPassengers / 18), // Estimate based on avg capacity
        hours: 6.2,
        activeVehicles: activeVehicles || 0
      }
    });

  } catch (error) {
    console.error('Staff stats API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`CityConnect API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;