const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require("axios").default;

router.get('/', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOEKN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

const callSendMessage = async (url, senderId, query) => {
  let options = {
    method: 'POST',
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    data: {
      senderId: senderId,
      query: query
    }
  };
  try {
    await axios.request(options);
  } catch (error) {
    console.error('Error calling send message:', error.message);
  }
}

router.post('/', async (req, res) => {
  try {
    let body = req.body;
    
    // Return a 200 OK response immediately to acknowledge receipt
    res.status(200).send('OK');
    
    // Check if this is a page webhook event
    if (body.object !== 'page') {
      return;
    }

    // Iterate over each entry - there may be multiple if batched
    for (const entry of body.entry) {
      // Iterate over each messaging event
      for (const webhookEvent of entry.messaging) {
        console.log('Received webhook event:', webhookEvent);

        // Skip if this is not a message event or if message doesn't have text
        if (!webhookEvent.message || !webhookEvent.message.text) {
          continue;
        }

        let senderId = webhookEvent.sender.id;
        let query = webhookEvent.message.text;
        
        // Only process if we have both sender ID and message text
        if (senderId && query) {
          console.log(`Processing message from ${senderId}: ${query}`);
          const host = req.hostname;
          let requestUrl = `https://${host}/sendMessage`;
          await callSendMessage(requestUrl, senderId, query);
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
