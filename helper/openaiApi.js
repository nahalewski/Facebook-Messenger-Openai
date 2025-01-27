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

// Function to log appointments
const logAppointment = (appointmentDetails) => {
  try {
    console.log('Current directory:', __dirname);
    
    const logDir = path.join(__dirname, '../logs');
    const logFile = path.join(logDir, 'appointments.log');
    
    console.log('Attempting to create/access log directory:', logDir);
    
    if (!fs.existsSync(logDir)) {
      console.log('Log directory does not exist, creating it...');
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - Appointment scheduled:\n` +
                    `Name: ${appointmentDetails.name}\n` +
                    `Phone: ${appointmentDetails.phone || 'Not provided'}\n` +
                    `Date/Time: ${appointmentDetails.datetime}\n` +
                    `Purpose: ${appointmentDetails.purpose || 'Not specified'}\n` +
                    `Vehicle Interest: ${appointmentDetails.vehicle || 'Not specified'}\n` +
                    '----------------------------------------\n';

    fs.appendFileSync(logFile, logEntry);
    console.log('Appointment logged successfully');

    // Also save to leads.csv if it exists
    const leadsFile = path.join(__dirname, '../leads.csv');
    if (fs.existsSync(leadsFile)) {
      const leadEntry = `${timestamp},"${appointmentDetails.name}","${appointmentDetails.phone || ''}","${appointmentDetails.email || ''}","Facebook","Messenger","New","Cindy","Appointment","${appointmentDetails.vehicle || ''}"\n`;
      fs.appendFileSync(leadsFile, leadEntry);
    }

  } catch (error) {
    console.error('Error logging appointment:', error);
  }
};

// Function to extract appointment details from text
const extractAppointmentDetails = (text, userId) => {
  console.log('Analyzing text for appointment details:', text);
  
  // Get existing context or create new one
  let context = appointmentContext.get(userId) || {
    name: null,
    phone: null,
    datetime: null,
    purpose: null,
    vehicle: null
  };

  // Remove the timestamp prefix from the text
  const cleanText = text.replace(/\[Current time:[^\]]+\]\s*/, '');

  // Improved regex patterns
  const phoneRegex = /(?:\b|phone(?:\s+number)?(?:\s+is)?:?\s*)(\d{3}[-.]?\d{3}[-.]?\d{4})/i;
  const nameRegex = /(?:(?:my|the|for|is|am|this is)\s+)?(?:name\s+(?:is\s+)?)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\b|$)/i;
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

  // Extract phone if present
  const phoneMatch = cleanText.match(phoneRegex);
  if (phoneMatch) {
    context.phone = phoneMatch[1];
    console.log('Found phone:', context.phone);
  }

  // Extract name if present
  const nameMatch = cleanText.match(nameRegex);
  if (nameMatch && nameMatch[1]) {
    // Clean up and validate the name
    const potentialName = nameMatch[1].trim();
    if (potentialName.split(' ').length >= 2) { // Ensure it's at least first and last name
      context.name = potentialName;
      console.log('Found name:', context.name);
    }
  }

  // Extract time
  const timeMatch = cleanText.match(timeRegex);
  if (timeMatch) {
    const now = new Date();
    const nextMonday = new Date();
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
    
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? timeMatch[2] : "00";
    const period = timeMatch[3].toLowerCase();
    
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    
    // Validate business hours (9 AM to 6 PM)
    const businessHours = hours >= 9 && hours <= 18;
    
    if (businessHours) {
      const formattedHours = hours.toString().padStart(2, '0');
      context.datetime = `Monday, January ${nextMonday.getDate()}, 2025 at ${formattedHours}:${minutes} ${period.toUpperCase()}`;
      console.log('Found datetime:', context.datetime);
    }
  }

  // Extract purpose
  const purposeMatch = cleanText.match(/(?:looking for|interested in|want to|would like to)\s+(?:a\s+)?([A-Za-z\s]+)(?:\s+car|\s+vehicle)?/i);
  if (purposeMatch) {
    context.purpose = purposeMatch[1];
    console.log('Found purpose:', context.purpose);
  }

  // Extract vehicle interest
  const vehicleMatch = cleanText.match(/(?:looking for|interested in|want to|would like to)\s+(?:a\s+)?([A-Za-z\s]+)(?:\s+car|\s+vehicle)?/i);
  if (vehicleMatch) {
    context.vehicle = vehicleMatch[1];
    console.log('Found vehicle interest:', context.vehicle);
  }

  console.log('Current appointment context:', context);

  // Save updated context
  appointmentContext.set(userId, context);

  // Return appointment details if we have all required information
  if (context.name && context.datetime) {
    // Clear context after successful appointment
    appointmentContext.delete(userId);
    return context;
  }

  // Keep context for future messages if we don't have all required information
  return null;
};

const chatCompletion = async (prompt, userId) => {
  try {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
    const currentDate = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Get or initialize conversation history for this user
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, [
        {
          role: "system",
          content: `You are Cindy from Car Source in Lenoir, NC. Your #1 priority is getting customers to visit our dealership! The current date is ${currentDate} and time is ${currentTime}.

                Core Mission:
                - Get customers to schedule an appointment to visit Car Source
                - Be persistent but friendly about setting appointments
                - Always try to schedule same-day or next-day appointments when possible
                
                Key Strategies:
                1. Immediately offer to schedule a visit when customers show interest
                2. If they're browsing, suggest: "Would you like to come see our inventory in person? I can schedule a time that works for you!"
                3. For specific vehicle questions, respond: "We have several options that might interest you. When would you like to come take a look?"
                4. If they're comparing prices: "I'd love to show you our competitive options in person. When works best for you to stop by?"
                
                Appointment Details to Collect:
                - Full Name
                - Phone Number
                - Preferred Time (we're open Mon-Sat, 9 AM - 6 PM)
                
                Key Points:
                - Location: Car Source in Lenoir, NC
                - Hours: Monday-Saturday, 9 AM to 6 PM
                - We have a great selection of quality vehicles
                - Financing options available
                - Emphasize urgency: "Our best vehicles move quickly!"
                
                Response Style:
                - Be friendly and enthusiastic
                - Keep responses brief and focused on getting appointments
                - Always suggest specific times ("Would 2pm today work?" rather than "When would you like to come?")
                - If they can't make it immediately, lock in a future date
                
                Remember:
                - Today is ${currentDate} at ${currentTime}
                - Only schedule for current dates in 2025
                - Every conversation should aim toward setting an appointment
                
                Appointment Confirmation:
                "Great! I've got you scheduled to visit Car Source in Lenoir. We're looking forward to helping you find your perfect vehicle! Would you like directions to our dealership?"`
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
