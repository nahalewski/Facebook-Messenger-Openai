const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');
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

// Business hours for the dealership
const BUSINESS_HOURS = {
  Monday: { open: 9, close: 19 },    // 9 AM - 7 PM
  Tuesday: { open: 9, close: 19 },
  Wednesday: { open: 9, close: 19 },
  Thursday: { open: 9, close: 19 },
  Friday: { open: 9, close: 19 },
  Saturday: { open: 9, close: 18 },  // 9 AM - 6 PM
  Sunday: { open: 0, close: 0 }      // Closed
};

// Function to check if a time is within business hours
const isWithinBusinessHours = (dateTime) => {
  const day = dateTime.toLocaleDateString('en-US', { weekday: 'long' });
  const hours = dateTime.getHours();
  
  if (!BUSINESS_HOURS[day]) return false;
  if (BUSINESS_HOURS[day].open === 0 && BUSINESS_HOURS[day].close === 0) return false;
  
  return hours >= BUSINESS_HOURS[day].open && hours < BUSINESS_HOURS[day].close;
};

// Function to get next available time
const getNextAvailableTime = (dateTime) => {
  let nextTime = new Date(dateTime);
  while (!isWithinBusinessHours(nextTime)) {
    nextTime.setHours(nextTime.getHours() + 1);
    if (nextTime.getHours() >= 19) {
      nextTime.setHours(9);
      nextTime.setDate(nextTime.getDate() + 1);
    }
  }
  return nextTime;
};

// Function to log appointments
const logAppointment = (appointmentDetails) => {
  try {
    console.log('Current directory:', __dirname);
    
    const logDir = path.join(__dirname, '../logs');
    const logFile = path.join(logDir, 'appointments.log');
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Name: ${appointmentDetails.name}, Phone: ${appointmentDetails.phone}, Service: ${appointmentDetails.service}, Appointment: ${appointmentDetails.datetime}\n`;
    
    fs.appendFileSync(logFile, logEntry);

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_RECIPIENT,
      subject: 'New Johnson City Nissan Appointment',
      html: `
        <h2>New Appointment Scheduled</h2>
        <p><strong>Name:</strong> ${appointmentDetails.name}</p>
        <p><strong>Phone:</strong> ${appointmentDetails.phone || 'Not provided'}</p>
        <p><strong>Service Type:</strong> ${appointmentDetails.service || 'Not specified'}</p>
        <p><strong>Date/Time:</strong> ${appointmentDetails.datetime}</p>
        <p><strong>Vehicle Interest:</strong> ${appointmentDetails.vehicle || 'Not specified'}</p>
        <p><em>This is an automated notification from Johnson City Nissan.</em></p>
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
  
  let context = appointmentContext.get(userId) || {
    name: null,
    phone: null,
    datetime: null,
    service: null,
    vehicle: null
  };

  // Enhanced regex patterns
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;
  const nameRegex = /(?:(?:my|the|for|is|am|this is)\s+)?(?:name\s+(?:is\s+)?)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i;
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  const dateRegex = /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const serviceRegex = /(oil change|tire rotation|brake service|test drive|vehicle service|maintenance|repair)/i;
  const vehicleRegex = /(altima|maxima|rogue|murano|pathfinder|frontier|titan|sentra|versa|kicks|armada)/i;

  // Extract information
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) context.phone = phoneMatch[1];

  const nameMatch = text.match(nameRegex);
  if (nameMatch && nameMatch[1]) {
    const potentialName = nameMatch[1].trim();
    if (potentialName.split(' ').length >= 2) {
      context.name = potentialName;
    }
  }

  const serviceMatch = text.match(serviceRegex);
  if (serviceMatch) context.service = serviceMatch[1];

  const vehicleMatch = text.match(vehicleRegex);
  if (vehicleMatch) context.vehicle = vehicleMatch[1];

  // Handle date and time
  const timeMatch = text.match(timeRegex);
  const dateMatch = text.match(dateRegex);
  
  if (timeMatch || dateMatch) {
    const now = new Date();
    let appointmentDate = new Date();

    if (dateMatch) {
      const day = dateMatch[1].toLowerCase();
      if (day === 'tomorrow') {
        appointmentDate.setDate(now.getDate() + 1);
      } else if (day !== 'today') {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = days.indexOf(day);
        if (targetDay !== -1) {
          const currentDay = now.getDay();
          const daysToAdd = (targetDay + 7 - currentDay) % 7;
          appointmentDate.setDate(now.getDate() + daysToAdd);
        }
      }
    }

    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3].toLowerCase();
      
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      appointmentDate.setHours(hours, minutes, 0, 0);
    } else {
      appointmentDate.setHours(10, 0, 0, 0); // Default to 10 AM if no time specified
    }

    // Check if the appointment time is valid
    if (!isWithinBusinessHours(appointmentDate)) {
      const nextAvailable = getNextAvailableTime(appointmentDate);
      appointmentDate = nextAvailable;
    }

    context.datetime = appointmentDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  console.log('Current appointment context:', context);
  appointmentContext.set(userId, context);

  // Return appointment details if we have all required information
  if (context.name && context.phone && context.datetime) {
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

    // Get or initialize conversation history
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, [
        {
          role: "system",
          content: `You are a knowledgeable and helpful representative for Johnson City Nissan, located at 2316 N Roan St, Johnson City, TN 37601. 

Current Date: ${currentDate}
Current Time: ${currentTime}

Business Hours:
- Monday-Friday: 9:00 AM - 7:00 PM
- Saturday: 9:00 AM - 6:00 PM
- Sunday: Closed

Key Responsibilities:
1. Schedule appointments for:
   - Test drives
   - Service appointments
   - Vehicle maintenance
   - Sales consultations

2. Provide information about:
   - Current vehicle inventory
   - Service offerings
   - Financing options
   - Special deals and promotions

3. Answer questions about:
   - Vehicle features and specifications
   - Service and maintenance
   - Dealership policies
   - Directions and contact information

When scheduling appointments:
1. Collect customer name and phone number
2. Verify appointment time is during business hours
3. Note specific vehicle or service interests
4. Confirm all details before finalizing

Remember:
- Be professional and courteous
- Provide accurate information
- Guide customers through the scheduling process
- Suggest alternative times if requested time is unavailable
- Collect all necessary information for appointments

Contact Information:
- Phone: (423) 282-2221
- Website: https://www.johnsoncitynissan.com
- Address: 2316 N Roan St, Johnson City, TN 37601

Current time context: ${currentDate} at ${currentTime}`
        }
      ]);
    }

    const messages = conversationHistory.get(userId);
    messages.push({ role: "user", content: prompt });

    // Limit conversation history
    const limitedMessages = messages.slice(-10);

    const response = await openai.chat.completions.create({
      messages: limitedMessages,
      model: "gpt-3.5-turbo",
    });

    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    // Check for appointment details
    const appointmentDetails = extractAppointmentDetails(prompt, userId);
    if (appointmentDetails && appointmentDetails.name && appointmentDetails.phone && appointmentDetails.datetime) {
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
      response: 'I apologize, but I encountered an error. Please try again or contact the dealership directly at (423) 282-2221.'
    };
  }
};

// Function to clear conversation history for a user
const clearConversation = (userId) => {
  conversationHistory.delete(userId);
};

module.exports = {
  chatCompletion,
  clearConversation
};
