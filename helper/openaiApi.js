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
        <p><strong>Phone:</strong> ${appointmentDetails.phone}</p>
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

  // More flexible regex patterns
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;
  const nameRegex = /(?:for|name is|I am|this is)?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s|$)/i;
  const dateTimeRegex = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*,)?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))|(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i;

  // Extract phone
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) context.phone = phoneMatch[1];

  // Extract name
  const nameMatch = text.match(nameRegex);
  if (nameMatch) context.name = nameMatch[1];

  // Extract date/time
  const dateTimeMatch = text.match(dateTimeRegex);
  if (dateTimeMatch) {
    const now = new Date();
    const nextMonday = new Date();
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7));
    
    const time = dateTimeMatch[1] || dateTimeMatch[2];
    context.datetime = `Monday, January ${nextMonday.getDate()}, 2025 at ${time}`;
  }

  console.log('Current appointment context:', context);

  // Save updated context
  appointmentContext.set(userId, context);

  // Return appointment details if we have all required information
  if (context.name && context.phone && context.datetime) {
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
