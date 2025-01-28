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
const logAppointment = async (appointmentDetails) => {
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
    // Get or initialize conversation history
    let history = conversationHistory.get(userId) || [];
    
    // Add system message with business hours and 24/7 scheduling
    const systemMessage = {
      role: "system",
      content: `You are a helpful AI assistant for Car Source, located at 542 Wilkesboro Blvd, Lenoir NC 28645. 

      Business Hours:
      - Monday to Saturday: 9:00 AM to 6:00 PM
      - Sunday: Closed
      
      Your primary goal is to collect customer information 24/7 for appointments by gathering:
      1. Customer's full name
      2. Phone number
      3. Preferred appointment time

      Key Instructions:
      - Always collect name first, then phone number, then appointment time
      - If any information is missing, politely ask for it
      - Verify the information once collected
      - Current date/time is ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}
      - Collect information 24/7, but inform customers that a representative will confirm their appointment during business hours
      - When discussing appointment times, mention our business hours (Mon-Sat 9 AM - 6 PM)
      - If customer requests a time outside business hours, politely suggest a time during business hours
      - If customer provides information, acknowledge it and ask for the next piece
      - Once all information is collected, confirm the details will be reviewed
      
      Example flow:
      1. "Hi! I'd love to help you schedule a visit to Car Source. Could you please share your full name?"
      2. After getting name: "Thanks [name]! Could I get your phone number to confirm the appointment?"
      3. After getting phone: "Perfect! What day and time would you prefer to visit us? Our business hours are Monday through Saturday, 9 AM to 6 PM."
      4. After getting time: "Thank you! I've recorded your request to visit Car Source at [time]. A representative will confirm your appointment during our business hours (Mon-Sat 9 AM - 6 PM). We look forward to helping you find your perfect vehicle!"

      Always maintain a friendly and professional tone while collecting this information. Remember to assure customers that their information has been received and will be processed during business hours.
      
      If customers ask about visiting outside business hours:
      - Politely inform them of our business hours
      - Suggest alternative times during business hours
      - Example: "While we're open Monday through Saturday from 9 AM to 6 PM, I'd be happy to schedule your visit during those hours. Would you prefer a different time during our business hours?"`
    };

    // Prepare messages array with system message and history
    const messages = [
      systemMessage,
      ...history,
      { role: "user", content: prompt }
    ];

    console.log('Sending request to OpenAI with messages:', JSON.stringify(messages));

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    console.log('Received response from OpenAI:', JSON.stringify(completion));

    // Validate the response structure
    if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      throw new Error('Invalid response structure from OpenAI');
    }

    // Get the response
    const response = completion.choices[0].message.content;

    if (typeof response !== 'string' || response.trim().length === 0) {
      throw new Error('Empty or invalid response from OpenAI');
    }

    // Update conversation history
    history.push({ role: "user", content: prompt });
    history.push({ role: "assistant", content: response });

    // Check for appointment details
    try {
      const appointmentDetails = extractAppointmentDetails(prompt, userId);
      if (appointmentDetails && appointmentDetails.name && appointmentDetails.phone && appointmentDetails.datetime) {
        await logAppointment(appointmentDetails);
      }
    } catch (error) {
      console.error('Error processing appointment details:', error);
      // Don't throw here, continue with the response
    }

    // Limit history to last 10 messages to prevent context overflow
    if (history.length > 10) {
      history = history.slice(-10);
    }

    // Save updated history
    conversationHistory.set(userId, history);

    return response;

  } catch (error) {
    console.error('Error in chatCompletion:', error);
    if (error.response) {
      console.error('OpenAI API error response:', error.response.data);
    }
    throw new Error('Failed to process your request. Please try again.');
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
