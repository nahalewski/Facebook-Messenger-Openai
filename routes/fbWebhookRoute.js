const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require("axios");

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
  console.log('Attempting to send message to AI:', { senderId, query });
  
  try {
    // Make request to the same server
    const url = '/sendMessage';
    console.log('Making request to:', url);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        senderId: senderId,
        query: query
      }
    };

    console.log('Request options:', JSON.stringify(options, null, 2));
    
    const response = await axios(url, options);
    console.log('AI response received:', response.status, response.data);
    return response;
  } catch (error) {
    console.error('Error calling send message:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    throw error;
  }
}

router.post('/', async (req, res) => {
  console.log('POST /facebook - Received webhook event');
  try {
    let body = req.body;
    
    console.log('Full webhook body:', JSON.stringify(body, null, 2));
    
    // Return a 200 OK response immediately to acknowledge receipt
    res.status(200).send('OK');
    
    // Check if this is a page webhook event
    if (!body.object || body.object !== 'page') {
      console.log('Not a page event:', body.object);
      return;
    }

    if (!body.entry || !Array.isArray(body.entry)) {
      console.log('No entries in webhook body');
      return;
    }

    console.log(`Processing ${body.entry.length} entries`);

    // Iterate over each entry - there may be multiple if batched
    for (const entry of body.entry) {
      if (!entry.messaging || !Array.isArray(entry.messaging)) {
        console.log('No messaging array in entry:', entry);
        continue;
      }

      console.log(`Processing ${entry.messaging.length} messaging events`);

      // Iterate over each messaging event
      for (const webhookEvent of entry.messaging) {
        console.log('Processing webhook event:', JSON.stringify(webhookEvent, null, 2));

        // Skip if this is not a message event or if message doesn't have text
        if (!webhookEvent.message || !webhookEvent.message.text) {
          console.log('Skipping event - no message or text:', webhookEvent);
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
        } else {
          console.log('Missing senderId or query:', { senderId, query });
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
