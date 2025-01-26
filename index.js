const express = require('express');
require('dotenv').config();

const webApp = express();

const PORT = process.env.PORT || 3000;

// Set EJS as the view engine
webApp.set('view engine', 'ejs');
webApp.set('views', './views');

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
