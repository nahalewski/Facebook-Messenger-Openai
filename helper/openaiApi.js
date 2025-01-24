const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Store conversations for each user
const conversationHistory = new Map();
// Store partial appointment details
const appointmentContext = new Map();

// Function to fetch car inventory
async function getCarInformation(searchQuery) {
  try {
    const baseUrl = 'https://www.hendrickhondahickory.com';
    const newCarsUrl = `${baseUrl}/new-inventory/index.htm`;
    const usedCarsUrl = `${baseUrl}/used-inventory/index.htm`;
    
    const results = {
      newCars: [],
      usedCars: []
    };

    // Fetch new cars
    const newCarsResponse = await axios.get(newCarsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    let $ = cheerio.load(newCarsResponse.data);
    $('.vehicle-card').each((i, element) => {
      const title = $(element).find('.vehicle-card-title').text().trim();
      const price = $(element).find('.price').text().trim();
      
      if (title.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.newCars.push({
          title,
          price,
          type: 'New'
        });
      }
    });

    // Fetch used cars
    const usedCarsResponse = await axios.get(usedCarsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    $ = cheerio.load(usedCarsResponse.data);
    $('.vehicle-card').each((i, element) => {
      const title = $(element).find('.vehicle-card-title').text().trim();
      const price = $(element).find('.price').text().trim();
      const mileage = $(element).find('.mileage').text().trim();
      
      if (title.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.usedCars.push({
          title,
          price,
          mileage,
          type: 'Used'
        });
      }
    });

    return results;
  } catch (error) {
    console.error('Error fetching car information:', error);
    return null;
  }
}

// [Previous logAppointment and extractAppointmentDetails functions remain the same]

const chatCompletion = async (prompt, userId) => {
  try {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
    const currentDate = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Check if the message is asking about cars
    const carSearchTerms = prompt.match(/(?:looking for|search for|find|about)\s+(?:a\s+)?([A-Za-z\s]+)(?:\s+car|\s+vehicle|\s+honda)?/i);
    let carInfoResponse = '';
    
    if (carSearchTerms) {
      const searchQuery = carSearchTerms[1];
      const carResults = await getCarInformation(searchQuery);
      
      if (carResults && (carResults.newCars.length > 0 || carResults.usedCars.length > 0)) {
        carInfoResponse = "Here's what I found at Hendrick Honda Hickory:\n\n";
        
        if (carResults.newCars.length > 0) {
          carInfoResponse += "New Cars:\n";
          carResults.newCars.forEach(car => {
            carInfoResponse += `- ${car.title}\n  Price: ${car.price}\n`;
          });
        }
        
        if (carResults.usedCars.length > 0) {
          carInfoResponse += "\nUsed Cars:\n";
          carResults.usedCars.forEach(car => {
            carInfoResponse += `- ${car.title}\n  Price: ${car.price}\n  Mileage: ${car.mileage}\n`;
          });
        }
        
        prompt += `\n\nAvailable inventory information:\n${carInfoResponse}`;
      }
    }

    // Get or initialize conversation history for this user
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, [
        {
          role: "system",
          content: `You are a helpful assistant at Hendrick Honda dealership in 2025. 
                Current Date: ${currentDate}
                Current Time: ${currentTime}

                Your primary tasks are:
                - Setting up test drive appointments Monday-Friday, 8 AM to 6 PM only
                - Scheduling service appointments Monday-Friday, 8 AM to 6 PM only
                - Answering questions about available 2024-2025 Honda vehicles
                - Providing Hendrick Honda dealership information
                
                Key guidelines:
                - Current year is 2025 - only schedule appointments for current dates
                - Only schedule appointments during business hours (Mon-Fri, 8 AM - 6 PM)
                - Always confirm the preferred day and time for appointments
                - If a customer requests outside business hours, politely redirect them to available times
                - Collect customer name and contact information for appointments
                - Be concise and professional in responses
                - Emphasize Hendrick Honda's commitment to customer service
                
                When collecting appointment information, always ask for:
                1. Full Name
                2. Phone Number
                3. Preferred Day and Time
                
                Please always verify appointment details before confirming and ensure dates are in 2025.
                Remember: Today is ${currentDate} at ${currentTime}.`
        }
      ]);
    }

    // Add current time context to user's message
    const timeContextPrompt = `[Current time: ${currentTime} on ${currentDate}] ${prompt}`;
    
    // Get conversation history and add new user message
    const messages = conversationHistory.get(userId);
    messages.push({ role: "user", content: timeContextPrompt });

    // Limit conversation history to last 10 messages to prevent token overflow
    const limitedMessages = messages.slice(-10);

    const response = await openai.chat.completions.create({
      messages: limitedMessages,
      model: "gpt-3.5-turbo",
    });

    // Add assistant's response to conversation history
    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    // Check for appointment details in the conversation
    const appointmentDetails = extractAppointmentDetails(timeContextPrompt, userId);
    if (appointmentDetails) {
      logAppointment(appointmentDetails);
    }

    return {
      status: 1,
      response: assistantMessage.content
    };
  } catch (error) {
    console.error('Error in chatCompletion:', error);
    return {
      status: 0,
      response: 'An error occurred while processing your request.'
    };
  }
};

// Function to clear conversation history for a user
const clearConversation = (userId) => {
  conversationHistory.delete(userId);
  appointmentContext.delete(userId);
};

module.exports = {
  chatCompletion,
  clearConversation
};
