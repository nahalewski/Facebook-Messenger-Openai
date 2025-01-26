const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const webApp = express();

const PORT = process.env.PORT || 3000;

// Set EJS as the view engine
webApp.set('view engine', 'ejs');
webApp.set('views', './views');

// Session configuration with MongoDB store
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/carsource',
        ttl: 24 * 60 * 60, // Session TTL (1 day)
        autoRemove: 'native',
        touchAfter: 24 * 3600 // Only update session once per day unless data changes
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Use secure cookies in production
if (process.env.NODE_ENV === 'production') {
    webApp.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
}

webApp.use(session(sessionConfig));

// Serve static files from the public directory
webApp.use(express.static('public'));
webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.json());

webApp.use((req, res, next) => {
    console.log(`Path ${req.path} with Method ${req.method}`);
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
