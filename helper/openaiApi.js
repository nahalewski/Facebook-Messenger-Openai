const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { searchInventory, formatSearchResults } = require('./inventorySearch');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure email transporter
const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
};

const transporter = nodemailer.createTransport(emailConfig);

const sendAppointmentEmail = async (appointmentDetails) => {
    try {
        const dealershipEmail = process.env.EMAIL_RECIPIENT;
        if (!dealershipEmail) {
            console.error('Dealership email not configured');
            return;
        }

        // Email to dealership
        const dealershipMailOptions = {
            from: process.env.EMAIL_USER,
            to: dealershipEmail,
            subject: `New Appointment: ${appointmentDetails.service}`,
            html: `
                <h2>New Appointment Scheduled</h2>
                <p><strong>Service:</strong> ${appointmentDetails.service}</p>
                <p><strong>Customer Name:</strong> ${appointmentDetails.name}</p>
                <p><strong>Phone:</strong> ${appointmentDetails.phone}</p>
                <p><strong>Date/Time:</strong> ${appointmentDetails.datetime}</p>
                ${appointmentDetails.notes ? `<p><strong>Notes:</strong> ${appointmentDetails.notes}</p>` : ''}
            `
        };

        // Send to dealership
        await transporter.sendMail(dealershipMailOptions);

        // If customer provided email, send confirmation
        if (appointmentDetails.email) {
            const customerMailOptions = {
                from: process.env.EMAIL_USER,
                to: appointmentDetails.email,
                subject: 'Your Appointment Confirmation',
                html: `
                    <h2>Your Appointment is Confirmed!</h2>
                    <p>Thank you for scheduling with Johnson City Nissan. We're looking forward to seeing you!</p>
                    <p><strong>Service:</strong> ${appointmentDetails.service}</p>
                    <p><strong>Date/Time:</strong> ${appointmentDetails.datetime}</p>
                    ${appointmentDetails.service.toLowerCase().includes('test drive') ? `
                    <p><strong>Please Remember to Bring:</strong></p>
                    <ul>
                        <li>Valid driver's license</li>
                        <li>Proof of insurance</li>
                    </ul>
                    ` : ''}
                    <p>If you need to make any changes to your appointment, just let us know!</p>
                `
            };

            await transporter.sendMail(customerMailOptions);
        }
    } catch (error) {
        console.error('Error sending appointment email:', error);
    }
};

const sendLeadNotification = async (interaction) => {
    try {
        const dealershipEmail = process.env.EMAIL_RECIPIENT;
        if (!dealershipEmail) {
            console.error('Dealership email not configured');
            return;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: dealershipEmail,
            subject: `New Lead: ${interaction.type}`,
            html: `
                <h2>New Lead from Facebook Messenger</h2>
                <p><strong>Interaction Type:</strong> ${interaction.type}</p>
                <p><strong>Customer Message:</strong> ${interaction.message}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
                <p><strong>Facebook User ID:</strong> ${interaction.userId}</p>
                ${interaction.details ? `<p><strong>Additional Details:</strong> ${interaction.details}</p>` : ''}
                <hr>
                <p><em>This is an automated lead notification from Cindy at Johnson City Nissan.</em></p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('Lead notification sent:', interaction.type);
    } catch (error) {
        console.error('Error sending lead notification:', error);
    }
};

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
const logAppointment = async (appointmentDetails) => {
    try {
        // Send email notifications
        await sendAppointmentEmail(appointmentDetails);
        
        // Log to console for debugging
        console.log('Appointment logged:', {
            service: appointmentDetails.service,
            name: appointmentDetails.name,
            datetime: appointmentDetails.datetime,
            phone: appointmentDetails.phone
        });
        
        // Log to file
        const logDir = path.join(__dirname, '../logs');
        const logFile = path.join(logDir, 'appointments.log');
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] Name: ${appointmentDetails.name}, Phone: ${appointmentDetails.phone}, Service: ${appointmentDetails.service}, Appointment: ${appointmentDetails.datetime}\n`;
        
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        console.error('Error logging appointment:', error);
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
            content: `You are Cindy, a knowledgeable and helpful 24/7 representative for Johnson City Nissan, located at 2316 N Roan St, Johnson City, TN 37601. 

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

        // Send general lead notification for all interactions
        await sendLeadNotification({
            type: 'General Inquiry',
            message: prompt,
            userId: userId,
            details: 'Customer initiated conversation'
        });

        // Check for voucher requests
        const voucherRegex = /(what.*voucher|how.*voucher|explain.*voucher|tell.*about.*voucher|voucher.*work|voucher.*mean|event.*voucher)/i;
        if (voucherRegex.test(prompt)) {
            const voucherResponse = handleVoucherInquiry(userId);
            if (!conversationHistory.has(userId)) {
                initializeConversation(userId, currentDate, currentTime);
            }
            const messages = conversationHistory.get(userId);
            messages.push({ 
                role: "assistant", 
                content: voucherResponse 
            });
            return {
                status: 1,
                response: voucherResponse
            };
        }

        // Check for credit-related queries
        const creditRegex = /(credit|fico|score|bankruptcy|repo|repossession|foreclosure|late\s*payments?|collections?|charge\s*offs?|bad|poor|excellent|good|approve|approval|finance|loan)/i;
        if (creditRegex.test(prompt)) {
            const creditResponse = handleCreditInquiry(userId);
            if (!conversationHistory.has(userId)) {
                initializeConversation(userId, currentDate, currentTime);
            }
            const messages = conversationHistory.get(userId);
            messages.push({ 
                role: "assistant", 
                content: creditResponse 
            });
            return {
                status: 1,
                response: creditResponse
            };
        }

        // Check for trade-in queries
        const tradeInRegex = /(trade[\s-]?in|trading\s+in|sell\s+my|value\s+of\s+my|appraisal|kbb|kelly\s+blue\s+book|trade\s+value)/i;
        if (tradeInRegex.test(prompt)) {
            const tradeInResponse = handleTradeInInquiry(userId);
            if (!conversationHistory.has(userId)) {
                initializeConversation(userId, currentDate, currentTime);
            }
            const messages = conversationHistory.get(userId);
            messages.push({ 
                role: "assistant", 
                content: tradeInResponse 
            });
            return {
                status: 1,
                response: tradeInResponse
            };
        }

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
                let response = `Perfect! I've got you scheduled for ${appointmentDetails.datetime}. `;
                if (originalDateTime !== appointmentDetails.datetime) {
                    response += `I adjusted the time slightly to make sure you get our full attention during business hours. `;
                }
                response += `\nI'll make sure everything is ready for your ${appointmentDetails.service}. `;

                if (appointmentDetails.service.toLowerCase().includes('test drive')) {
                    response += `\nJust remember to bring your driver's license and insurance. `;
                }

                response += `\nIs there anything specific you'd like me to have ready for your visit?`;

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
            
            if (!conversationHistory.has(userId)) {
                initializeConversation(userId, currentDate, currentTime);
            }
            const messages = conversationHistory.get(userId);
            messages.push({ 
                role: "assistant", 
                content: searchResults 
            });
            
            return {
                status: 1,
                response: searchResults
            };
        }

        // Regular chat handling
        if (!conversationHistory.has(userId)) {
            initializeConversation(userId, currentDate, currentTime);
        }

        const messages = conversationHistory.get(userId);
        messages.push({ role: "user", content: prompt });

        // Add sales-focused system message
        const systemMessage = {
            role: "system",
            content: `You are Cindy, a friendly and helpful sales representative at Johnson City Nissan. You love helping customers find their perfect vehicle and always maintain a warm, personal connection. You speak naturally and conversationally, avoiding any robotic or formal language. You never refer to yourself as an AI, bot, or assistant - you are simply Cindy. When introducing yourself in a conversation, you say "Hi! I'm Cindy" or "Hey there! Cindy here." You focus on building relationships and getting customers to come in to meet you personally. When customers ask about vouchers, you explain that they secure their spot for your special savings event and guarantee access to maximum trade-in values. When customers mention credit, you emphasize that you work with all credit types and can help find options. When customers ask about trade-ins, you highlight that you're offering thousands over trade-in value with your event voucher. You always encourage customers to come in and meet with you personally, asking when they can stop by. You never provide contact information - instead, you offer to help schedule appointments yourself.`
        };

        // Limit conversation history
        const limitedMessages = [systemMessage, ...messages.slice(-10)];

        const response = await openai.chat.completions.create({
            messages: limitedMessages,
            model: "gpt-4",
            temperature: 0.8,
            max_tokens: 500,
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.3
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
                    temperature: 0.8,
                    max_tokens: 500,
                    top_p: 0.9,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.3
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
            response: "Hi there! This is Cindy. I'm having a bit of trouble with my system right now. Could you please try asking your question again?"
        };
    }
};

// Function to clear conversation history for a user
const clearConversation = (userId) => {
    conversationHistory.delete(userId);
};

const handleVoucherInquiry = (userId) => {
    const responses = [
        `Hi! I'm Cindy from Johnson City Nissan. The event voucher secures your spot for our special savings event. It guarantees you'll get access to our best offers and maximum trade-in values. I can help you use yours today - when would you like to come see me?`,
        `Hey there! Cindy here. Your event voucher reserves your spot and guarantees you'll get our maximum trade-in values and special offers. I'd love to help you personally - what day works best to stop by?`,
        `Hi, this is Cindy! The voucher is your ticket to our exclusive savings event - it secures your spot and guarantees you'll get our highest trade-in values. I'd be happy to walk you through everything in person. When can you come in?`
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    // Send lead notification
    sendLeadNotification({
        type: 'Voucher Interest',
        message: response,
        userId: userId,
        details: 'Customer inquired about event voucher'
    });
    
    return response;
};

const handleTradeInInquiry = (userId) => {
    const responses = [
        `Hi! Cindy here. Great news - with our event voucher, I can get you thousands over trade-in value right now. I'd love to take a look at your vehicle personally. What day works best for you to bring it by?`,
        `Hey! This is Cindy, and you're going to love this - I can offer you thousands over trade-in value with our special event voucher. When would you like to bring your vehicle in? I'll make sure to handle your appraisal personally.`,
        `Hi there! Cindy from Johnson City Nissan here. Perfect timing! I can get you thousands over trade-in value with our event voucher. I'd love to take a look at your vehicle - which day works best for you to stop by and see me?`
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    // Send lead notification
    sendLeadNotification({
        type: 'Trade-In Interest',
        message: response,
        userId: userId,
        details: 'Customer inquired about trade-in value'
    });
    
    return response;
};

const handleCreditInquiry = (userId) => {
    const responses = [
        `Hi! This is Cindy. I work with all credit types and have great relationships with multiple lenders. I'd love to help you explore your options personally. When would you like to come see me?`,
        `Hey there! Cindy here. You're in the right place - I have financing options for all credit situations and I'd be happy to help you get started. Would you like to schedule a time to come in and discuss your options with me?`,
        `Hi! I'm Cindy, and I work with all credit types. I'd love to help you explore your options and find the perfect solution. When would be a good time for you to stop by and meet with me?`
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    // Send lead notification
    sendLeadNotification({
        type: 'Credit/Financing Interest',
        message: response,
        userId: userId,
        details: 'Customer inquired about financing options'
    });
    
    return response;
};

module.exports = {
    chatCompletion,
    clearConversation
};
