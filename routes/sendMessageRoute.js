const express = require('express');
const router = express.Router();
require('dotenv').config();

const { chatCompletion } = require('../helper/openaiApi');
const { sendMessage, setTypingOff, setTypingOn } = require('../helper/messengerApi');

router.post('/', async (req, res) => {
  const { senderId, query } = req.body;
  
  // Validate required fields
  if (!senderId || !query) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Set typing indicator
    await setTypingOn(senderId);

    // Get AI response
    const result = await chatCompletion(query);
    
    if (!result || !result.response) {
      throw new Error('No response from AI');
    }

    // Send the message
    await sendMessage(senderId, result.response);
    
    // Log successful interaction
    console.log(`Sent response to ${senderId}:`, result.response);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in sendMessage route:', error);
    
    // Try to send an error message to the user
    try {
      await sendMessage(senderId, "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.");
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    // Always try to turn off typing indicator
    try {
      await setTypingOff(senderId);
    } catch (typingError) {
      console.error('Error turning off typing indicator:', typingError);
    }
  }
});

module.exports = {
  router
};
