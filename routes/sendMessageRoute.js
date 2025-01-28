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
      // Continue despite typing indicator error
    }

    let response;
    try {
      console.log('Calling chatCompletion...');
      response = await chatCompletion(query, senderId);
      console.log('ChatCompletion response:', response);
    } catch (err) {
      console.error('Error in chatCompletion:', err);
      throw new Error(err.message || 'Failed to process message');
    }

    if (!response || typeof response !== 'string') {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from chat completion');
    }

    try {
      console.log('Sending message back to user:', response);
      await sendMessage(senderId, response);
      console.log('Message sent successfully');
    } catch (err) {
      console.error('Error sending message:', err);
      throw new Error('Failed to send message to user');
    }

    try {
      await setTypingOff(senderId);
    } catch (err) {
      console.error('Error setting typing indicator off:', err);
      // Continue despite typing indicator error
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in message handler:', error);
    
    try {
      await setTypingOff(senderId);
    } catch (err) {
      console.error('Error setting typing indicator off after error:', err);
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

module.exports = {
  router
};
