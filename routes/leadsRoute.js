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

// Store leads in a JSON file
const LEADS_FILE = path.join(__dirname, '../data/leads.json');

// Ensure leads directory exists
const ensureLeadsFile = async () => {
    try {
        const dir = path.dirname(LEADS_FILE);
        await fs.mkdir(dir, { recursive: true });
        try {
            await fs.access(LEADS_FILE);
        } catch {
            await fs.writeFile(LEADS_FILE, JSON.stringify([], null, 2));
        }
    } catch (error) {
        console.error('Error ensuring leads file:', error);
    }
};

// Initialize leads file
ensureLeadsFile();

// Get all leads
router.get('/', async (req, res) => {
    try {
        const leads = JSON.parse(await fs.readFile(LEADS_FILE, 'utf8'));
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
        const leads = JSON.parse(await fs.readFile(LEADS_FILE, 'utf8'));
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
        const parseAsync = promisify(csv.parse);
        const records = await parseAsync(req.file.buffer, {
            columns: true,
            skip_empty_lines: true
        });

        let existingLeads = [];
        try {
            existingLeads = JSON.parse(await fs.readFile(LEADS_FILE, 'utf8'));
        } catch (error) {
            console.error('Error reading existing leads:', error);
        }

        const newLeads = records.map(record => ({
            time: record.time || new Date().toISOString(),
            type: record.type || 'Imported Lead',
            name: record.name || 'Not provided',
            phone: record.phone || 'Not provided',
            preferredVisit: record.preferredVisit || 'Not provided',
            message: record.message || '',
            response: record.response || '',
            details: record.details || 'Imported from CSV'
        }));

        const updatedLeads = [...existingLeads, ...newLeads];
        await fs.writeFile(LEADS_FILE, JSON.stringify(updatedLeads, null, 2));

        res.redirect('/leads?message=Successfully imported ' + newLeads.length + ' leads');
    } catch (error) {
        console.error('Error processing CSV:', error);
        res.redirect('/leads?message=Error processing CSV file');
    }
});

module.exports = router;
