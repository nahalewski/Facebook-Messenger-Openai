const express = require('express');
const router = express.Router();
require('dotenv').config();

const { chatCompletion } = require('../helper/openaiApi');
const { sendMessage, setTypingOff, setTypingOn } = require('../helper/messengerApi');

router.post('/', async (req, res) => {
  try {
    console.log('Received message request:', req.body);
    
    let body = req.body;
    if (!body.senderId || !body.query) {
      console.error('Missing required fields:', body);
      return res.status(400).json({ error: 'Missing senderId or query' });
    }

    let senderId = body.senderId;
    let query = body.query;

    console.log(`Processing AI request for ${senderId}: ${query}`);

    try {
      await setTypingOn(senderId);
    } catch (err) {
      console.error('Error setting typing indicator:', err);
    }

    let result;
    try {
      console.log('Calling chatCompletion...');
      result = await chatCompletion(query, senderId);
      console.log('ChatCompletion result:', result);
    } catch (err) {
      console.error('Error in chatCompletion:', err);
      throw err;
    }

    if (!result || !result.response) {
      console.error('Invalid response from chatCompletion:', result);
      throw new Error('Invalid response from chatCompletion');
    }

    try {
      console.log('Sending message back to user:', result.response);
      await sendMessage(senderId, result.response);
      console.log('Message sent successfully');
    } catch (err) {
      console.error('Error sending message:', err);
      throw err;
    }

    try {
      await setTypingOff(senderId);
    } catch (err) {
      console.error('Error turning off typing indicator:', err);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in message handler:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = {
  router
};
