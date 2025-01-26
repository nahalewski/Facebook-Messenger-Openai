const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

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
            title: 'Johnson City Nissan Leads',
            leads: leads
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

module.exports = router;
