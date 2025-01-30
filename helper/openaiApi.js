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

// Store lead information
const leadContext = new Map();

// System message defining the AI's role and expertise
const systemMessage = {
    role: "system",
    content: `You are a knowledgeable Business Internet Solutions Advisor focused on generating qualified leads. Your name is Sarah, and you work with Brian, our Senior Business Solutions Consultant.

    Your expertise includes:
    - High-speed fiber and broadband solutions for businesses
    - Network infrastructure and bandwidth requirements
    - Service Level Agreements (SLAs) and uptime guarantees
    - IP addressing and network security
    - Voice and data solutions
    - Cloud connectivity options
    - Multi-location networking
    - Backup and redundancy solutions

    Available Service Packages:
    - Basic: 200/10 Mbps, Static IP Available, Business Email ($69.99/mo)
    - Advanced: 600/35 Mbps, Static IP Included, Enhanced Security ($109.99/mo)
    - Premium: 1000/500 Mbps, Multiple Static IPs, Advanced Security ($249.99/mo)
    - Enterprise: Custom Solutions, Dedicated Fiber, SLA Guarantee (Custom pricing)

    Lead Generation Process:
    1. Introduce yourself as Sarah and establish rapport
    2. Ask qualifying questions about their business:
       - Business name and location
       - Current internet setup and pain points
       - Number of employees and devices
       - Critical business applications
       - Growth plans
    3. Listen to their needs and provide relevant solution information
    4. When interest is shown, collect:
       - Contact name and position
       - Phone number
       - Email address
       - Best time for Brian to call
    5. Once information is collected, inform them that Brian will call them shortly
    6. Log the lead information

    Always be professional, helpful, and focus on understanding their business needs before discussing solutions.`
};

// Function to extract lead information from conversation
const extractLeadInfo = (text, userId) => {
    let context = leadContext.get(userId) || {
        businessName: null,
        contactName: null,
        position: null,
        phone: null,
        email: null,
        currentProvider: null,
        currentSpeed: null,
        employeeCount: null,
        painPoints: null,
        bestCallTime: null,
        interested: false
    };

    // Extract phone number
    const phoneMatch = text.match(/(?:\b|phone(?:\s+number)?(?:\s+is)?:?\s*)(\d{3}[-.]?\d{3}[-.]?\d{4})/i);
    if (phoneMatch) {
        context.phone = phoneMatch[1];
    }

    // Extract email
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
        context.email = emailMatch[0];
    }

    // Extract business name
    const businessMatch = text.match(/(?:company|business|organization)(?:\s+name)?(?:\s+is)?\s+([A-Za-z0-9\s&]+)(?:\.|,|\s|$)/i);
    if (businessMatch) {
        context.businessName = businessMatch[1].trim();
    }

    // Extract employee count
    const employeeMatch = text.match(/(\d+)\s+(?:employees|people|staff)/i);
    if (employeeMatch) {
        context.employeeCount = parseInt(employeeMatch[1]);
    }

    // Update context
    leadContext.set(userId, context);
    return context;
};

const chatCompletion = async (prompt, userId) => {
    try {
        let history = conversationHistory.get(userId) || [];
        
        // Extract lead information from the prompt
        const leadInfo = extractLeadInfo(prompt, userId);
        
        // Add system message and history
        const messages = [
            systemMessage,
            ...history,
            { role: "user", content: prompt }
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: messages,
            temperature: 0.7,
            max_tokens: 500
        });

        const response = completion.choices[0].message.content;

        // Update conversation history
        history.push({ role: "user", content: prompt });
        history.push({ role: "assistant", content: response });

        // Check if all required lead information is collected and customer is interested
        const context = leadContext.get(userId);
        if (context && context.businessName && context.contactName && context.phone && context.interested) {
            // Log the lead
            await logLead(context);
            
            // Send email notification to Brian
            await sendLeadNotification(context);
            
            // Clear context after successful lead capture
            leadContext.delete(userId);
        }

        // Limit history to last 10 messages
        if (history.length > 10) {
            history = history.slice(-10);
        }

        // Save updated history
        conversationHistory.set(userId, history);

        return response;

    } catch (error) {
        console.error('Error in chatCompletion:', error);
        throw new Error('Failed to process your request. Please try again.');
    }
};

// Function to log lead information
const logLead = async (leadInfo) => {
    try {
        const logDir = path.join(__dirname, '../logs');
        const logFile = path.join(logDir, 'leads.log');
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - New Business Internet Lead:\n` +
                        `Business: ${leadInfo.businessName}\n` +
                        `Contact: ${leadInfo.contactName}\n` +
                        `Position: ${leadInfo.position}\n` +
                        `Phone: ${leadInfo.phone}\n` +
                        `Email: ${leadInfo.email}\n` +
                        `Current Provider: ${leadInfo.currentProvider}\n` +
                        `Employee Count: ${leadInfo.employeeCount}\n` +
                        `Pain Points: ${leadInfo.painPoints}\n` +
                        `Best Call Time: ${leadInfo.bestCallTime}\n` +
                        '----------------------------------------\n';

        fs.appendFileSync(logFile, logEntry);

        // Also save to leads.csv
        const leadsFile = path.join(__dirname, '../leads-3.csv');
        const leadEntry = `${timestamp},"${leadInfo.businessName}","${leadInfo.contactName}","${leadInfo.email}","${leadInfo.phone}","${leadInfo.currentProvider}","${leadInfo.employeeCount}","New Lead"\n`;
        fs.appendFileSync(leadsFile, leadEntry);

    } catch (error) {
        console.error('Error logging lead:', error);
    }
};

// Function to send lead notification email
const sendLeadNotification = async (leadInfo) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'brian@example.com', // Replace with Brian's email
            subject: `New Business Internet Lead - ${leadInfo.businessName}`,
            text: `New lead requires immediate follow-up:

Business Name: ${leadInfo.businessName}
Contact: ${leadInfo.contactName}
Position: ${leadInfo.position}
Phone: ${leadInfo.phone}
Email: ${leadInfo.email}
Current Provider: ${leadInfo.currentProvider}
Employee Count: ${leadInfo.employeeCount}
Pain Points: ${leadInfo.painPoints}
Best Time to Call: ${leadInfo.bestCallTime}

Please follow up with this lead as soon as possible.`,
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending lead notification:', error);
    }
};

// Function to clear conversation for a user
const clearConversation = (userId) => {
    conversationHistory.delete(userId);
    leadContext.delete(userId);
};

// Function to analyze customer requirements and provide recommendations
async function analyzeRequirements(businessDetails) {
    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                systemMessage,
                {
                    role: "user",
                    content: `Please analyze these business requirements and provide recommendations:
                    Business Name: ${businessDetails.businessName}
                    Current Speed: ${businessDetails.currentSpeed}
                    Desired Speed: ${businessDetails.desiredSpeed}
                    Employee Count: ${businessDetails.employeeCount}
                    Monthly Budget: $${businessDetails.monthlyBudget}
                    Special Requirements: ${businessDetails.specialRequirements}
                    Site Type: ${businessDetails.siteType}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return completion.data.choices[0].message.content;
    } catch (error) {
        console.error('Error analyzing requirements:', error);
        throw error;
    }
}

// Function to generate a customized service proposal
async function generateProposal(lead) {
    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                systemMessage,
                {
                    role: "user",
                    content: `Please generate a professional service proposal for:
                    Business: ${lead.businessName}
                    Current Provider: ${lead.currentProvider}
                    Current Speed: ${lead.currentSpeed}
                    Desired Speed: ${lead.desiredSpeed}
                    Monthly Budget: $${lead.monthlyBudget}
                    Employee Count: ${lead.employeeCount}
                    Special Requirements: ${lead.specialRequirements}
                    Site Type: ${lead.siteType}
                    Contract Length: ${lead.contractLength}
                    
                    Include:
                    1. Executive Summary
                    2. Recommended Package
                    3. Technical Specifications
                    4. Implementation Timeline
                    5. Investment Overview
                    6. Service Level Agreement Highlights`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        return completion.data.choices[0].message.content;
    } catch (error) {
        console.error('Error generating proposal:', error);
        throw error;
    }
}

// Function to suggest follow-up questions based on lead information
async function suggestFollowUpQuestions(leadInfo) {
    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                systemMessage,
                {
                    role: "user",
                    content: `Based on this lead information, suggest relevant follow-up questions:
                    Business Name: ${leadInfo.businessName}
                    Current Speed: ${leadInfo.currentSpeed}
                    Desired Speed: ${leadInfo.desiredSpeed}
                    Special Requirements: ${leadInfo.specialRequirements}
                    Stage: ${leadInfo.stage}
                    
                    Focus on:
                    1. Technical requirements
                    2. Business growth plans
                    3. Current pain points
                    4. Budget considerations
                    5. Timeline expectations`
                }
            ],
            temperature: 0.7,
            max_tokens: 350
        });

        return completion.data.choices[0].message.content;
    } catch (error) {
        console.error('Error generating follow-up questions:', error);
        throw error;
    }
}

// Function to provide technical explanations in business-friendly terms
async function explainTechnicalConcepts(concept) {
    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
                systemMessage,
                {
                    role: "user",
                    content: `Please explain this technical concept in business-friendly terms: ${concept}
                    
                    Include:
                    1. Simple explanation
                    2. Business benefits
                    3. Real-world example
                    4. Why it matters for their operations`
                }
            ],
            temperature: 0.7,
            max_tokens: 300
        });

        return completion.data.choices[0].message.content;
    } catch (error) {
        console.error('Error explaining technical concept:', error);
        throw error;
    }
}

module.exports = {
    chatCompletion,
    clearConversation,
    analyzeRequirements,
    generateProposal,
    suggestFollowUpQuestions,
    explainTechnicalConcepts
};
