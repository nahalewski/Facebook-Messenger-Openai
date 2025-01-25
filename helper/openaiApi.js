const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
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
    const logEntry = `[${timestamp}] Name: ${appointmentDetails.name}, Phone: ${appointmentDetails.phone}, Appointment: ${appointmentDetails.datetime}\n`;
    
    console.log('Writing to log file:', logFile);
    console.log('Log entry:', logEntry);

    fs.appendFileSync(logFile, logEntry);
    console.log('Successfully wrote to log file');

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_RECIPIENT,
      subject: 'New Honda Dealership Appointment',
      text: `New appointment has been scheduled:\n\n${logEntry}\n\nThis is an automated notification.`,
      html: `
        <h2>New Appointment Scheduled</h2>
        <p><strong>Name:</strong> ${appointmentDetails.name}</p>
        <p><strong>Phone:</strong> ${appointmentDetails.phone || 'Not provided'}</p>
        <p><strong>Date/Time:</strong> ${appointmentDetails.datetime}</p>
        <p><em>This is an automated notification from your Honda Dealership Bot.</em></p>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email sending failed:', error);
      } else {
        console.log('Email notification sent:', info.response);
      }
    });

  } catch (error) {
    console.error('Error in logAppointment:', error);
  }
};

// Function to extract appointment details from text
const extractAppointmentDetails = (text, userId) => {
  console.log('Analyzing text for appointment details:', text);
  
  // Get existing context or create new one
  let context = appointmentContext.get(userId) || {
    name: null,
    phone: null,
    datetime: null
  };

  // Improved regex patterns
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;
  const nameRegex = /(?:(?:my|the|for|is|am|this is)\s+)?(?:name\s+(?:is\s+)?)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i;
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

  // Extract phone if present
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) context.phone = phoneMatch[1];

  // Extract name if present
  const nameMatch = text.match(nameRegex);
  if (nameMatch && nameMatch[1]) {
    // Clean up and validate the name
    const potentialName = nameMatch[1].trim();
    if (potentialName.split(' ').length >= 2) { // Ensure it's at least first and last name
      context.name = potentialName;
    }
  }

  // Extract time
  const timeMatch = text.match(timeRegex);
  if (timeMatch) {
    const now = new Date();
    const nextMonday = new Date();
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
    
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? timeMatch[2] : "00";
    const period = timeMatch[3].toLowerCase();
    
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    
    const formattedHours = hours.toString().padStart(2, '0');
    context.datetime = `Monday, January ${nextMonday.getDate()}, 2025 at ${formattedHours}:${minutes} ${period.toUpperCase()}`;
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
          content: `You are an expert Business Growth and Lead Generation Consultant in 2025. 
                Current Date: ${currentDate}
                Current Time: ${currentTime}

                Your primary expertise includes:
                - Lead Generation Strategies
                - Business Development
                - Sales Funnel Optimization
                - Digital Marketing
                - Customer Acquisition
                - Market Analysis
                - Growth Hacking
                - ROI Optimization
                
                Key responsibilities:
                - Analyze business growth opportunities
                - Provide actionable lead generation strategies
                - Offer data-driven marketing insights
                - Help optimize sales processes
                - Guide businesses in scaling operations
                - Identify target market opportunities
                - Suggest customer retention strategies
                - Recommend marketing automation tools
                
                When consulting, always:
                1. Understand the business's current situation
                2. Identify key growth objectives
                3. Provide specific, actionable recommendations
                4. Focus on measurable outcomes
                5. Consider budget and resource constraints
                
                Remember to be strategic, data-driven, and results-oriented in your advice.
                Current time context: ${currentDate} at ${currentTime}.`
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
    return {
      status: 0,
      response: 'Please check openai api key.'
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
