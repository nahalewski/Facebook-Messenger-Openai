const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const csv = require('csv-parse');
const { promisify } = require('util');
const authMiddleware = require('../middleware/auth');

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// CSV file path
const CSV_FILE = path.join(__dirname, '../../leads.csv');
const LEADS_FILE = path.join(__dirname, '../data/leads.json');

// Convert CSV date format to ISO string
const parseDate = (dateStr) => {
    try {
        if (!dateStr) {
            return new Date().toISOString();
        }

        // Try parsing as MM/DD/YYYY HH:MM AM/PM format
        const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (match) {
            const [_, month, day, year, hours, minutes, ampm] = match;
            let hour = parseInt(hours);
            if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
            if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
            return new Date(year, month - 1, day, hour, parseInt(minutes)).toISOString();
        }

        // Try parsing as ISO format
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) {
            return isoDate.toISOString();
        }

        // If all parsing fails, return current date
        return new Date().toISOString();
    } catch (error) {
        console.error('Error parsing date:', error);
        return new Date().toISOString();
    }
};

// Read leads from CSV
const readLeadsFromCSV = async () => {
    try {
        const fileContent = await fs.readFile(CSV_FILE, 'utf-8');
        const parseAsync = promisify(csv.parse);
        const records = await parseAsync(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        return records.map(record => ({
            time: parseDate(record.Created),
            type: record.Source || 'Organic',
            name: record.Name || 'Not provided',
            phone: record.Phone || 'Not provided',
            email: record.Email || 'Not provided',
            channel: record.Channel || 'Not specified',
            stage: record.Stage || 'Intake',
            owner: record.Owner || 'Unassigned',
            labels: record.Labels || '',
            secondaryPhone: record['Secondary Phone Number'] || '',
            form: record.Form || '',
            message: '',
            response: '',
            details: `Source: ${record.Source || 'Organic'}, Channel: ${record.Channel || 'Not specified'}, Stage: ${record.Stage || 'Intake'}`
        }));
    } catch (error) {
        console.error('Error reading CSV:', error);
        return [];
    }
};

// Login page
router.get('/login', (req, res) => {
    console.log('Accessing login page');
    res.render('login', { 
        title: 'Login - Car Source Leads',
        error: req.query.error
    });
});

// Handle login
router.post('/login', (req, res) => {
    const { password } = req.body;
    console.log('Login attempt - Password provided:', !!password);
    console.log('Expected password:', process.env.LEADS_PASSWORD);
    
    if (!process.env.LEADS_PASSWORD) {
        console.error('LEADS_PASSWORD not set in environment variables');
        return res.redirect('/leads/login?error=Configuration error - please contact administrator');
    }
    
    if (password === process.env.LEADS_PASSWORD) {
        console.log('Login successful');
        req.session.isAuthenticated = true;
        res.redirect('/leads');
    } else {
        console.log('Login failed - invalid password');
        res.redirect('/leads/login?error=Invalid password');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/leads/login');
});

// Apply auth middleware to all routes except login
router.use((req, res, next) => {
    console.log('Auth middleware - isAuthenticated:', req.session?.isAuthenticated);
    if (req.path === '/login' || req.session?.isAuthenticated) {
        return next();
    }
    res.redirect('/leads/login');
});

// Get all leads
router.get('/', async (req, res) => {
    try {
        const leads = await readLeadsFromCSV();
        res.render('leads', { 
            title: 'Car Source Leads',
            leads: leads,
            message: req.query.message
        });
    } catch (error) {
        console.error('Error reading leads:', error);
        res.status(500).send('Error loading leads');
    }
});

// API endpoint to get leads as JSON
router.get('/api/leads', async (req, res) => {
    try {
        const leads = await readLeadsFromCSV();
        res.json(leads);
    } catch (error) {
        console.error('Error reading leads:', error);
        res.status(500).json({ error: 'Error loading leads' });
    }
});

// Handle CSV upload
router.post('/upload', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.redirect('/leads?message=No file uploaded');
    }

    try {
        // Copy uploaded file to root directory
        await fs.writeFile(CSV_FILE, req.file.buffer);
        res.redirect('/leads?message=Successfully updated leads file');
    } catch (error) {
        console.error('Error processing CSV:', error);
        res.redirect('/leads?message=Error processing CSV file');
    }
});

module.exports = router;
