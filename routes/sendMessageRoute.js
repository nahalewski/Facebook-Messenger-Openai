const express = require('express');
const router = express.Router();
require('dotenv').config();

const { chatCompletion } = require('../helper/openaiApi');
const { sendMessage, setTypingOff, setTypingOn } = require('../helper/messengerApi');

router.post('/', async (req, res) => {
  console.log('POST /sendMessage - Received request');
  try {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
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
      console.log('Typing indicator turned on');
    } catch (err) {
      console.error('Error setting typing indicator:', err);
    }

    let result;
    try {
      console.log('Calling chatCompletion...');
      result = await chatCompletion(query, senderId);
      console.log('ChatCompletion result:', JSON.stringify(result, null, 2));
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
      console.error('Error sending message:', {
        error: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      throw err;
    }

    try {
      await setTypingOff(senderId);
      console.log('Typing indicator turned off');
    } catch (err) {
      console.error('Error turning off typing indicator:', err);
    }

    console.log('Request completed successfully');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in message handler:', {
      error: error.message,
      stack: error.stack
    });
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
