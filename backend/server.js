require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

// Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL or Key is not defined. Make sure to set environment variables.");
    process.exit(1); // Exit if Supabase keys are not set
}
const supabase = createClient(supabaseUrl, supabaseKey);

// -----------------------------------------------------------------------------
// API Routes
// -----------------------------------------------------------------------------

const apiRoutes = express.Router();

// Test route to confirm the API is reachable
apiRoutes.get('/', (req, res) => {
    res.json({ message: 'API is running!' });
});

// Signup Route
apiRoutes.post('/signup', async (req, res) => {
    const { email, password, fullName, role, vehicleNumber } = req.body;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                role: role,
                vehicle_number: vehicleNumber || null
            }
        }
    });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ user: data.user, session: data.session });
});

// Login Route
apiRoutes.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ user: data.user, session: data.session, token: data.session.access_token });
});

// Get User Profile Route (Protected)
apiRoutes.get('/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) return res.status(401).json({ error: 'Invalid token' });

    // Combine auth user data with public profile data if needed in the future
    const profileData = {
        user: {
            ...user,
            user_metadata: {
                ...user.user_metadata,
                role: user.user_metadata.role || 'traveller' // ensure role is set
            }
        }
    };

    res.json(profileData);
});

// Get all bus locations
apiRoutes.get('/buses', async (req, res) => {
    const { data, error } = await supabase.from('buses').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// -----------------------------------------------------------------------------
// App Setup
// -----------------------------------------------------------------------------

// Test route to confirm the server is running
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// **IMPORTANT**: Register all the API routes with the main app
app.use('/api', apiRoutes);

// Start the server
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

