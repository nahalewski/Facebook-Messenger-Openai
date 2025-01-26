const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require("axios").default;

router.get('/', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  
  console.log('Webhook verification attempt:', { mode, token });
  
  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      console.log('Webhook verification failed:', { 
        expectedToken: process.env.VERIFY_TOKEN,
        receivedToken: token 
      });
      res.sendStatus(403);
    }
  }
});

const callSendMessage = async (senderId, query) => {
  let options = {
    method: 'POST',
    url: '/sendMessage',  // Use relative URL
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      senderId: senderId,
      query: query
    }
  };
  
  try {
    console.log('Sending message to AI:', options);
    const response = await axios.request(options);
    console.log('AI response status:', response.status);
    return response;
  } catch (error) {
    console.error('Error calling send message:', error.response?.data || error.message);
    throw error;
  }
}

router.post('/', async (req, res) => {
  try {
    let body = req.body;
    
    console.log('Received webhook body:', JSON.stringify(body, null, 2));
    
    // Return a 200 OK response immediately to acknowledge receipt
    res.status(200).send('OK');
    
    // Check if this is a page webhook event
    if (body.object !== 'page') {
      console.log('Not a page event:', body.object);
      return;
    }

    // Iterate over each entry - there may be multiple if batched
    for (const entry of body.entry) {
      // Iterate over each messaging event
      for (const webhookEvent of entry.messaging) {
        console.log('Processing webhook event:', webhookEvent);

        // Skip if this is not a message event or if message doesn't have text
        if (!webhookEvent.message || !webhookEvent.message.text) {
          console.log('Skipping non-message event');
          continue;
        }

        let senderId = webhookEvent.sender.id;
        let query = webhookEvent.message.text;
        
        // Only process if we have both sender ID and message text
        if (senderId && query) {
          console.log(`Processing message from ${senderId}: ${query}`);
          try {
            await callSendMessage(senderId, query);
            console.log('Message processed successfully');
          } catch (error) {
            console.error('Failed to process message:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

module.exports = {
  router
};
