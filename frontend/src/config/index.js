import React from 'react';
import ReactDOM from 'react-dom/client';

// This is a simple component that will be displayed on the page
function App() {
  // You can replace this with the HTML/JS from our previous index.html file later
  return <h1>Hello from React! Your CityConnect app is running.</h1>;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);