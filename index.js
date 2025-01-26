const express = require('express');
const session = require('express-session');
const Redis = require('connect-redis');
const { createClient } = require('redis');
require('dotenv').config();

const webApp = express();

const PORT = process.env.PORT || 3000;

// Initialize Redis client
let RedisStore = Redis(session);
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        tls: process.env.NODE_ENV === 'production',
        rejectUnauthorized: false
    }
});

redisClient.connect().catch(console.error);

// Handle Redis client errors
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
    console.log('Successfully connected to Redis');
});

// Set EJS as the view engine
webApp.set('view engine', 'ejs');
webApp.set('views', './views');

// Serve static files from the public directory
webApp.use(express.static('public'));
webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.json());

// Session configuration
const sessionConfig = {
    store: new RedisStore({ 
        client: redisClient,
        prefix: "carsource:"
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'carsource.sid' // Custom session cookie name
};

// Use secure cookies in production
if (process.env.NODE_ENV === 'production') {
    webApp.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}

webApp.use(session(sessionConfig));

// Debug middleware
webApp.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
    console.log('Session ID:', req.sessionID);
    console.log('Session Data:', req.session);
    next();
});

const homeRoute = require('./routes/homeRoute');
const fbWebhookRoute = require('./routes/fbWebhookRoute');
const sendMessageRoute = require('./routes/sendMessageRoute');
const leadsRoute = require('./routes/leadsRoute');

webApp.use('/', homeRoute.router);
webApp.use('/webhook', fbWebhookRoute.router);
webApp.use('/sendMessage', sendMessageRoute.router);
webApp.use('/leads', leadsRoute);

webApp.listen(PORT, () => {
    console.log(`Server is up and running at ${PORT}`);
});
