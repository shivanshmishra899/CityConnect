import React, { useState, useEffect, useRef } from 'react';
import './App.css'; // Your CSS file must be created at frontend/src/App.css
import L from 'leaflet'; // Import leaflet for the map
import 'leaflet/dist/leaflet.css'; // Import leaflet's CSS

// --- Helper: API Request Function ---
const API_BASE_URL = 'https://cityconnect-api.onrender.com/api';

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const config = { method, headers, body: body ? JSON.stringify(body) : null };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json(); // Read the body once
    if (!response.ok) {
        throw new Error(data.error || `HTTP error! Status: ${response.status}`);
    }
    return data;
}

// --- The Main App Component ---
function App() {
    // State for user data and authentication
    const [currentUser, setCurrentUser] = useState(null);
    const [token, setToken] = useState(null);

    // State for UI elements like forms, errors, and loading indicators
    const [authView, setAuthView] = useState('login'); // Can be 'login' or 'signup'
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    
    // State for application data
    const [vehicles, setVehicles] = useState([]);

    // Refs to hold instances that don't need to re-render the component
    const mapInstance = useRef(null);
    const vehicleMarkers = useRef({});

    // This useEffect runs only once when the app starts
    useEffect(() => {
        const savedToken = localStorage.getItem('authToken');
        const savedUser = localStorage.getItem('currentUser');
        if (savedToken && savedUser) {
            setToken(savedToken);
            setCurrentUser(JSON.parse(savedUser));
        }
    }, []);
    
    // This useEffect runs when the user logs in
    useEffect(() => {
        if (currentUser) {
            fetchVehicles(localStorage.getItem('authToken'));
            const intervalId = setInterval(() => fetchVehicles(localStorage.getItem('authToken')), 30000); // Refresh every 30s
            
            // Cleanup function to stop the timer when the user logs out
            return () => clearInterval(intervalId);
        }
    }, [currentUser]);

    // This useEffect handles map initialization and updates
    useEffect(() => {
        // Initialize map only if user is logged in and map doesn't exist yet
        if (currentUser && !mapInstance.current) {
            const map = L.map('map').setView([20.5937, 78.9629], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);
            mapInstance.current = map;
        }

        // Update markers whenever vehicle data changes
        if (mapInstance.current) {
            updateMapMarkers(vehicles);
        }

    }, [currentUser, vehicles]);


    const fetchVehicles = async (currentToken) => {
        try {
            const data = await apiRequest('/vehicles', 'GET', null, currentToken);
            setVehicles(data);
        } catch (err) {
            console.error("Failed to fetch vehicles:", err);
            setError("Could not load vehicle data.");
        }
    };

    const updateMapMarkers = (vehicleList) => {
        const busIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448620.png',
            iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -40]
        });

        vehicleList.forEach(vehicle => {
            if (vehicle.status === 'active' && vehicle.lat && vehicle.lng) {
                const position = [vehicle.lat, vehicle.lng];
                const popupContent = `<b>${vehicle.number}</b><br>Route: ${vehicle.route}`;
                
                if (vehicleMarkers.current[vehicle.id]) {
                    vehicleMarkers.current[vehicle.id].setLatLng(position).setPopupContent(popupContent);
                } else {
                    vehicleMarkers.current[vehicle.id] = L.marker(position, { icon: busIcon })
                        .addTo(mapInstance.current)
                        .bindPopup(popupContent);
                }
            }
        });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const email = e.target.elements.loginEmail.value;
        const password = e.target.elements.loginPassword.value;

        try {
            const data = await apiRequest('/auth/login', 'POST', { email, password });
            setToken(data.session.access_token);
            setCurrentUser(data.user);
            localStorage.setItem('authToken', data.session.access_token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        const name = e.target.elements.signupName.value;
        const email = e.target.elements.signupEmail.value;
        const phone = e.target.elements.signupPhone.value;
        const password = e.target.elements.signupPassword.value;
        const confirmPassword = e.target.elements.signupConfirmPassword.value;

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            setLoading(false);
            return;
        }
        try {
            await apiRequest('/auth/signup', 'POST', { name, email, phone, password, role: 'traveller' });
            setSuccess("Account created! Please log in.");
            setAuthView('login');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        setCurrentUser(null);
        setToken(null);
        window.location.reload(); // Easiest way to reset all state
    };
    
    // If there's no user, show the login/signup page.
    if (!currentUser) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo"><i className="fas fa-bus"></i></div>
                        <h1 className="auth-title">LokYatra</h1>
                        <p className="auth-subtitle">Smart Public Transport</p>
                    </div>

                    {authView === 'login' ? (
                        <form id="loginForm" onSubmit={handleLogin}>
                             <div className="form-group">
                                <label className="form-label"><i className="fas fa-envelope"></i> Email Address</label>
                                <input type="email" id="loginEmail" name="loginEmail" className="form-input" placeholder="Enter your email" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label"><i className="fas fa-lock"></i> Password</label>
                                <input type="password" id="loginPassword" name="loginPassword" className="form-input" placeholder="Enter your password" required />
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                            <button type="submit" className="btn btn-primary" style={{width: '100%'}} disabled={loading}>
                                {loading ? <div className="loading"></div> : 'Sign In'}
                            </button>
                            <div style={{textAlign: 'center', marginTop: '1.5rem', color: '#6b7280'}}>
                                Don't have an account? <a href="#" onClick={() => setAuthView('signup')}>Sign up</a>
                            </div>
                        </form>
                    ) : (
                        <form id="signupForm" onSubmit={handleSignup}>
                            <div className="form-group">
                               <label className="form-label"><i className="fas fa-user"></i> Full Name</label>
                               <input type="text" id="signupName" name="signupName" className="form-input" placeholder="Enter your full name" required/>
                           </div>
                           <div className="form-group">
                               <label className="form-label"><i className="fas fa-envelope"></i> Email Address</label>
                               <input type="email" id="signupEmail" name="signupEmail" className="form-input" placeholder="Enter your email" required/>
                           </div>
                           <div className="form-group">
                               <label className="form-label"><i className="fas fa-phone"></i> Phone Number</label>
                               <input type="tel" id="signupPhone" name="signupPhone" className="form-input" placeholder="Enter your phone number" required/>
                           </div>
                           <div className="form-group">
                               <label className="form-label"><i className="fas fa-lock"></i> Password</label>
                               <input type="password" id="signupPassword" name="signupPassword" className="form-input" placeholder="Create a password" required/>
                           </div>
                           <div className="form-group">
                               <label className="form-label"><i className="fas fa-lock"></i> Confirm Password</label>
                               <input type="password" id="signupConfirmPassword" name="signupConfirmPassword" className="form-input" placeholder="Confirm your password" required/>
                           </div>
                            {error && <div className="error-message">{error}</div>}
                            <button type="submit" className="btn btn-secondary" style={{width: '100%'}} disabled={loading}>
                                {loading ? <div className="loading"></div> : 'Create Account'}
                            </button>
                            <div style={{textAlign: 'center', marginTop: '1.5rem', color: '#6b7280'}}>
                                Already have an account? <a href="#" onClick={() => setAuthView('login')}>Sign in</a>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }
    
    // If there IS a user, show the main application.
    return (
        <div>
            <header className="header">
                <div className="container">
                    <div className="header-content">
                        <div className="logo">
                            <i className="fas fa-bus"></i>
                            <div>
                                <div>LokYatra</div>
                                <div style={{fontSize: '0.875rem', color: '#6b7280', fontWeight: 'normal'}}>
                                    Welcome, {currentUser.name}
                                </div>
                            </div>
                        </div>
                        <div className="nav-buttons">
                            <button className="btn btn-outline" onClick={handleLogout}>
                                <i className="fas fa-sign-out-alt"></i> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>
            <main className="dashboard">
                <div className="container">
                    <div className="map-container"><div id="map" style={{height: '100%'}}></div></div>
                    {/* Display content based on user role */}
                    {currentUser.role === 'traveller' && <TravellerDashboard vehicles={vehicles} />}
                    {currentUser.role === 'staff' && <StaffDashboard />}
                </div>
            </main>
        </div>
    );
}


function TravellerDashboard({ vehicles }) {
    return (
        <div className="card">
            <div className="card-header"><h2 className="card-title">Live Vehicles</h2></div>
            <div className="vehicles-grid">
                {vehicles.length > 0 ? vehicles.map(vehicle => (
                    <div key={vehicle.id} className="vehicle-card">
                        <div className="vehicle-header">
                             <div className="vehicle-info">
                                 <div className="vehicle-icon"><i className="fas fa-bus-alt"></i></div>
                                 <div>
                                     <div className="vehicle-number">{vehicle.number}</div>
                                     <div className="vehicle-route">{vehicle.route}</div>
                                 </div>
                             </div>
                             <span className={`status-badge ${vehicle.status === 'active' ? 'status-active' : 'status-inactive'}`}>{vehicle.status}</span>
                         </div>
                    </div>
                )) : <p>Loading vehicles...</p>}
            </div>
        </div>
    );
}

function StaffDashboard() {
    // Staff-specific logic would go here
    return (
        <div className="card">
             <div className="card-header"><h2 className="card-title">Staff Dashboard</h2></div>
             <p>Staff features coming soon.</p>
        </div>
    );
}

export default App;
