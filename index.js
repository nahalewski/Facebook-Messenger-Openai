const express = require('express');
require('dotenv').config();
const path = require('path');

const webApp = express();

const PORT = process.env.PORT || 5000;

// View engine setup
webApp.set('view engine', 'ejs');
webApp.set('views', path.join(__dirname, 'views'));

webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.json());
webApp.use(express.static(path.join(__dirname, 'public')));

webApp.use((req, res, next) => {
  console.log(`Path ${req.path} with Method ${req.method}`);
  next();
});

const fbWebhookRoute = require('./routes/fbWebhookRoute');
const sendMessageRoute = require('./routes/sendMessageRoute');
const leadsRoute = require('./routes/leadsRoute');

// Serve index.html for root
webApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes
webApp.use('/facebook', fbWebhookRoute.router);
webApp.use('/sendMessage', sendMessageRoute.router);
webApp.use('/leads', leadsRoute.router);

webApp.listen(PORT, () => {
  console.log(`Server is up and running at ${PORT}`);
});
