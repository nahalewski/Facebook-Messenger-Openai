const express = require('express');
require('dotenv').config();
const path = require('path');

const webApp = express();

const PORT = process.env.PORT || 5000;

webApp.use(express.urlencoded({ extended: true }));
webApp.use(express.json());
webApp.use(express.static(path.join(__dirname, 'public')));

webApp.use((req, res, next) => {
  console.log(`Path ${req.path} with Method ${req.method}`);
  next();
});

const fbWebhookRoute = require('./routes/fbWebhookRoute');
const sendMessageRoute = require('./routes/sendMessageRoute');

// Serve index.html for both / and /index.html routes
webApp.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

webApp.use('/facebook', fbWebhookRoute.router);
webApp.use('/sendMessage', sendMessageRoute.router);

webApp.listen(PORT, () => {
  console.log(`Server is up and running at ${PORT}`);
});
