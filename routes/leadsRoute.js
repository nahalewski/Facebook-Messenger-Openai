const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const csv = require('csv-parse');
const { promisify } = require('util');

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
        const [date, time] = dateStr.split(' ');
        const [month, day, year] = date.split('/');
        const [hours, minutes] = time.replace(/[ap]m/i, '').split(':');
        const isPM = time.toLowerCase().includes('pm');
        
        let hour = parseInt(hours);
        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;

        const dateObj = new Date(year, month - 1, day, hour, parseInt(minutes));
        return dateObj.toISOString();
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
            skip_empty_lines: true
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
