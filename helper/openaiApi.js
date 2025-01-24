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
    
    // Validate business hours (8 AM to 6 PM)
    const businessHours = hours >= 8 && hours <= 18;
    
    if (businessHours) {
      const formattedHours = hours.toString().padStart(2, '0');
      context.datetime = `Monday, January ${nextMonday.getDate()}, 2025 at ${formattedHours}:${minutes} ${period.toUpperCase()}`;
      console.log('Found datetime:', context.datetime);
    }
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
