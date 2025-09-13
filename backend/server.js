const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- API Endpoints ---

// 1. User Signup
app.post('/api/signup', async (req, res) => {
    const { email, password, fullName, role, vehicleNumber } = req.body;

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) return res.status(400).json({ error: authError.message });
    if (!authData.user) return res.status(500).json({ error: 'User not created' });
    
    const user = authData.user;

    // Update user profile with full name
    const { error: profileError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (profileError) console.error("Error updating profile:", profileError.message);


    // Insert into public 'users' or 'staff' table
    if (role === 'driver' || role === 'conductor') {
        const { error: staffError } = await supabase.from('staff').insert({
            user_id: user.id,
            full_name: fullName,
            role,
            vehicle_number: vehicleNumber
        });
        if (staffError) return res.status(400).json({ error: staffError.message });
    } else {
         const { error: userError } = await supabase.from('users').insert({
            user_id: user.id,
            full_name: fullName,
            email: user.email
        });
        if (userError) return res.status(400).json({ error: userError.message });
    }

    res.status(200).json({ user, session: authData.session });
});

// 2. User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) return res.status(401).json({ error: error.message });
    res.status(200).json(data);
});

// 3. Get User Profile (Protected)
app.get('/api/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError) return res.status(401).json({ error: userError.message });

    // Check if user is in the staff table
    const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
    if (staffData) {
        res.json({ ...user, role: staffData.role, vehicle_number: staffData.vehicle_number });
    } else {
        res.json({ ...user, role: 'traveller' });
    }
});


// 4. Get All Bus Locations
app.get('/api/buses', async (req, res) => {
    // In a real app, this data would be updated frequently by a driver's app
    const { data, error } = await supabase.from('buses').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 5. Get All Routes
app.get('/api/routes', async (req, res) => {
     const { data, error } = await supabase.from('routes').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});


// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
