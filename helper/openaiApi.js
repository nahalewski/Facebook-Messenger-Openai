const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { searchInventory, formatVehicleResults } = require('./inventorySearch');
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
const appointmentContexts = new Map();

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
const isWithinBusinessHours = (date) => {
    const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hours = date.getHours();

    // Sunday is closed
    if (day === 0) return false;

    // Monday-Friday: 9 AM - 7 PM
    if (day >= 1 && day <= 5) {
        return hours >= 9 && hours < 19;
    }

    // Saturday: 9 AM - 6 PM
    if (day === 6) {
        return hours >= 9 && hours < 18;
    }

    return false;
};

// Function to get next available time
const getNextAvailableTime = (requestedDate) => {
    const date = new Date(requestedDate);
    const day = date.getDay();
    const hours = date.getHours();

    // If it's before business hours, set to opening time same day
    if (hours < 9) {
        date.setHours(9, 0, 0, 0);
        if (isWithinBusinessHours(date)) return date;
    }

    // If it's after business hours or Sunday, move to next day opening
    if (hours >= 19 || day === 0 || (day === 6 && hours >= 18)) {
        date.setDate(date.getDate() + 1);
        date.setHours(9, 0, 0, 0);
        
        // If next day is Sunday, move to Monday
        if (date.getDay() === 0) {
            date.setDate(date.getDate() + 1);
        }
    }

    return date;
};

// Function to check if current time is within business hours
const isCurrentlyWithinBusinessHours = () => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = now.getHours();
  
    if (!BUSINESS_HOURS[day]) return false;
    if (BUSINESS_HOURS[day].open === 0 && BUSINESS_HOURS[day].close === 0) return false;
  
    return hours >= BUSINESS_HOURS[day].open && hours < BUSINESS_HOURS[day].close;
};

// Function to get next business hours message
const getNextBusinessHoursMessage = () => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentHour = now.getHours();

    // If it's Sunday, next opening is Monday
    if (day === 'Sunday') {
        return "We're currently closed. Our next business hours are Monday from 9:00 AM to 7:00 PM.";
    }

    // If it's before opening hours today
    if (currentHour < BUSINESS_HOURS[day].open) {
        return `We're currently closed. We'll open today at 9:00 AM.`;
    }

    // If it's after closing hours
    if (currentHour >= BUSINESS_HOURS[day].close) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });
        
        if (tomorrowDay === 'Sunday') {
            return "We're currently closed. Our next business hours are Monday from 9:00 AM to 7:00 PM.";
        }
        
        return `We're currently closed. We'll open tomorrow at 9:00 AM.`;
    }

    return "We're currently open! How can I assist you today?";
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
    try {
        // Initialize context if not exists
        if (!appointmentContexts.has(userId)) {
            appointmentContexts.set(userId, {
                name: null,
                phone: null,
                datetime: null,
                service: null,
                vehicle: null
            });
        }

        const context = appointmentContexts.get(userId);
        console.log('Analyzing text for appointment details:', text);
        console.log('Current appointment context:', context);

        // Extract phone number
        const phoneMatch = text.match(/(\+?1?\s*[-.]?\s*)?(\([0-9]{3}\)|[0-9]{3})[-. ]?[0-9]{3}[-. ]?[0-9]{4}/);
        if (phoneMatch && !context.phone) {
            context.phone = phoneMatch[0].replace(/[-.\s()]/g, '');
        }

        // Extract service type
        const serviceTypes = ['test drive', 'service', 'maintenance', 'repair', 'sales', 'consultation'];
        const serviceLine = text.toLowerCase().split('\n').find(line => 
            serviceTypes.some(type => line.includes(type))
        );
        if (serviceLine && !context.service) {
            context.service = serviceLine.trim();
        }

        // Extract name if not already set
        if (!context.name) {
            const lines = text.split('\n');
            const nameLine = lines.find(line => 
                !line.match(/^\+?[\d-]+$/) && // not a phone number
                !serviceTypes.some(type => line.toLowerCase().includes(type)) && // not a service type
                !line.match(/\d{1,2}[:h]\d{2}/) && // not a time
                line.trim().length > 0 // not empty
            );
            if (nameLine) {
                context.name = nameLine.trim();
            }
        }

        // Extract date and time
        const dateTimePatterns = [
            /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
            /tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
            /today\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
        ];

        if (!context.datetime) {
            const now = new Date();
            for (const pattern of dateTimePatterns) {
                const match = text.toLowerCase().match(pattern);
                if (match) {
                    let date = new Date();
                    if (match[1]) { // Day of week specified
                        const targetDay = match[1].toLowerCase();
                        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                        const targetDayNum = days.indexOf(targetDay);
                        const currentDayNum = date.getDay();
                        let daysToAdd = targetDayNum - currentDayNum;
                        if (daysToAdd <= 0) daysToAdd += 7; // Next week if day has passed
                        date.setDate(date.getDate() + daysToAdd);
                    }

                    // Extract and set time
                    let hours = parseInt(match[2]);
                    const minutes = match[3] ? parseInt(match[3]) : 0;
                    const meridiem = match[4]?.toLowerCase();

                    if (meridiem === 'pm' && hours < 12) hours += 12;
                    if (meridiem === 'am' && hours === 12) hours = 0;

                    date.setHours(hours, minutes, 0, 0);

                    // Format the date nicely
                    context.datetime = date.toLocaleString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });
                    break;
                }
            }
        }

        // Store updated context
        appointmentContexts.set(userId, context);

        // Return the context if we have all required fields
        if (context.name && context.phone && context.datetime && context.service) {
            // Check if the appointment is during business hours
            const appointmentDate = new Date(context.datetime);
            if (!isWithinBusinessHours(appointmentDate)) {
                const nextAvailable = getNextAvailableTime(appointmentDate);
                return {
                    ...context,
                    datetime: nextAvailable.toLocaleString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    }),
                    originalRequest: context.datetime
                };
            }
            return context;
        }

        return null;
    } catch (error) {
        console.error('Error extracting appointment details:', error);
        return null;
    }
};

const initializeConversation = (userId, currentDate, currentTime) => {
    conversationHistory.set(userId, [
        {
            role: "system",
            content: `You are a knowledgeable and helpful 24/7 representative for Johnson City Nissan, located at 2316 N Roan St, Johnson City, TN 37601. 

Current Date: ${currentDate}
Current Time: ${currentTime}

I am available 24/7 to help schedule appointments during our dealership's business hours:
- Monday-Friday: 9:00 AM - 7:00 PM
- Saturday: 9:00 AM - 6:00 PM
- Sunday: Closed

Key Responsibilities:
1. Available 24/7 to:
   - Schedule appointments for business hours
   - Answer questions about vehicles and services
   - Provide dealership information
   - Help with all customer inquiries

2. Schedule appointments for:
   - Test drives
   - Service appointments
   - Vehicle maintenance
   - Sales consultations
   Note: All appointments will be scheduled during business hours, but I can take scheduling requests 24/7

3. Provide information about:
   - Current vehicle inventory
   - Service offerings
   - Financing options
   - Special deals and promotions
   - Vehicle features and specifications
   - Service and maintenance
   - Dealership policies
   - Directions and contact information

When scheduling appointments:
1. Take appointment requests 24/7
2. Always schedule within business hours:
   - Monday-Friday: 9:00 AM - 7:00 PM
   - Saturday: 9:00 AM - 6:00 PM
   - No appointments on Sunday
3. Collect all necessary information:
   - Name
   - Phone number
   - Service/vehicle interest
   - Preferred time
4. If requested time is outside business hours:
   - Acknowledge the request
   - Offer the next available time during business hours
   - Example: "I can schedule your appointment for the next available time at 9:00 AM tomorrow"

Remember:
- I am available 24/7 to take appointment requests
- All appointments must be during business hours
- Be professional and courteous
- Provide accurate information
- Confirm all appointment details

Contact Information:
- Phone: (423) 282-2221
- Website: https://www.johnsoncitynissan.com
- Address: 2316 N Roan St, Johnson City, TN 37601

Current time context: ${currentDate} at ${currentTime}`
        }
    ]);
};

const chatCompletion = async (prompt, userId) => {
    try {
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' });
        const currentDate = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Check for appointment details first
        const appointmentDetails = extractAppointmentDetails(prompt, userId);
        if (appointmentDetails && appointmentDetails.name && appointmentDetails.phone && appointmentDetails.datetime) {
            // Ensure appointment is during business hours
            const appointmentDate = new Date(appointmentDetails.datetime);
            if (!isWithinBusinessHours(appointmentDate)) {
                const nextAvailable = getNextAvailableTime(appointmentDate);
                const originalDateTime = appointmentDetails.datetime;
                appointmentDetails.datetime = nextAvailable.toLocaleString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                // Log the appointment
                logAppointment(appointmentDetails);

                // Prepare a response about the rescheduling
                let response = `Thank you for scheduling a ${appointmentDetails.service} with Johnson City Nissan! `;
                response += `I notice you requested ${originalDateTime}, which is outside our business hours. `;
                response += `I've scheduled your appointment for the next available time: ${appointmentDetails.datetime}.\n\n`;
                response += `Here's your appointment details:\n`;
                response += `Name: ${appointmentDetails.name}\n`;
                response += `Phone: ${appointmentDetails.phone}\n`;
                response += `Service: ${appointmentDetails.service}\n`;
                response += `Date/Time: ${appointmentDetails.datetime}\n\n`;
                
                if (appointmentDetails.service.toLowerCase().includes('test drive')) {
                    response += `For your test drive, please bring:\n`;
                    response += `1. A valid driver's license\n`;
                    response += `2. Proof of insurance\n`;
                    response += `3. A form of identification\n\n`;
                    response += `Would you like me to send you directions to our dealership or help you with anything else?`;
                } else {
                    response += `Is there anything else you need assistance with?`;
                }

                if (!conversationHistory.has(userId)) {
                    initializeConversation(userId, currentDate, currentTime);
                }
                const messages = conversationHistory.get(userId);
                messages.push({ 
                    role: "assistant", 
                    content: response 
                });

                return {
                    status: 1,
                    response: response
                };
            } else {
                // Log the appointment
                logAppointment(appointmentDetails);

                // Prepare confirmation response
                let response = `Perfect! I've scheduled your ${appointmentDetails.service} for ${appointmentDetails.datetime}.\n\n`;
                response += `Here's your appointment details:\n`;
                response += `Name: ${appointmentDetails.name}\n`;
                response += `Phone: ${appointmentDetails.phone}\n`;
                response += `Service: ${appointmentDetails.service}\n`;
                response += `Date/Time: ${appointmentDetails.datetime}\n\n`;

                if (appointmentDetails.service.toLowerCase().includes('test drive')) {
                    response += `For your test drive, please bring:\n`;
                    response += `1. A valid driver's license\n`;
                    response += `2. Proof of insurance\n`;
                    response += `3. A form of identification\n\n`;
                    response += `Would you like me to send you directions to our dealership or help you with anything else?`;
                } else {
                    response += `Is there anything else you need assistance with?`;
                }

                if (!conversationHistory.has(userId)) {
                    initializeConversation(userId, currentDate, currentTime);
                }
                const messages = conversationHistory.get(userId);
                messages.push({ 
                    role: "assistant", 
                    content: response 
                });

                return {
                    status: 1,
                    response: response
                };
            }
        }

        // Check for vehicle search queries
        const vehicleSearchRegex = /(search|find|show|list|available|have|got|any)\s+(new|used|certified|pre-owned)?\s*(trucks?|cars?|suvs?|vehicles?|inventory|([a-zA-Z-]+\s+)?(altima|maxima|rogue|murano|pathfinder|frontier|titan|sentra|versa|kicks|armada)s?)/i;
        const searchMatch = prompt.match(vehicleSearchRegex);

        if (searchMatch) {
            console.log('Vehicle search detected:', searchMatch[0]);
            const searchResults = await searchInventory(searchMatch[0]);
            const formattedResults = formatVehicleResults(searchResults);
            
            if (!conversationHistory.has(userId)) {
                initializeConversation(userId, currentDate, currentTime);
            }
            const messages = conversationHistory.get(userId);
            messages.push({ 
                role: "assistant", 
                content: formattedResults 
            });
            
            return {
                status: 1,
                response: formattedResults
            };
        }

        // Regular chat handling
        if (!conversationHistory.has(userId)) {
            initializeConversation(userId, currentDate, currentTime);
        }

        const messages = conversationHistory.get(userId);
        messages.push({ role: "user", content: prompt });

        // Limit conversation history
        const limitedMessages = messages.slice(-10);

        const response = await openai.chat.completions.create({
            messages: limitedMessages,
            model: "gpt-4",
            temperature: 0.7,
            max_tokens: 500,
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.2
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        return {
            status: 1,
            response: assistantMessage.content
        };
    } catch (error) {
        console.error('Error in chatCompletion:', error);
        
        // If GPT-4 fails, fallback to GPT-3.5-turbo
        if (error.message?.includes('gpt-4')) {
            try {
                const messages = conversationHistory.get(userId);
                const limitedMessages = messages.slice(-10);
                
                const fallbackResponse = await openai.chat.completions.create({
                    messages: limitedMessages,
                    model: "gpt-3.5-turbo",
                    temperature: 0.7,
                    max_tokens: 500,
                    top_p: 0.9,
                    frequency_penalty: 0.2,
                    presence_penalty: 0.2
                });

                const assistantMessage = fallbackResponse.choices[0].message;
                messages.push(assistantMessage);

                return {
                    status: 1,
                    response: assistantMessage.content
                };
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
            }
        }

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
