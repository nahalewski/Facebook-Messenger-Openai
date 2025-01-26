const express = require('express');
const router = express.Router();
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// GET /leads - Display leads page
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
        res.render('leads', { 
            title: 'Car Source Leads',
            leads: [],
            message: 'Error reading leads data'
        });
    }
});

// POST /leads/upload - Handle CSV file upload
router.post('/upload', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.redirect('/leads?message=No file uploaded');
    }

    try {
        // Move file to leads.csv
        fs.copyFileSync(req.file.path, path.join(__dirname, '../leads.csv'));
        fs.unlinkSync(req.file.path); // Clean up temp file
        res.redirect('/leads?message=Leads updated successfully');
    } catch (error) {
        console.error('Error handling upload:', error);
        res.redirect('/leads?message=Error uploading file');
    }
});

// Helper function to read leads from CSV
async function readLeadsFromCSV() {
    return new Promise((resolve, reject) => {
        const results = [];
        const csvPath = path.join(__dirname, '../leads.csv');

        if (!fs.existsSync(csvPath)) {
            return resolve([]);
        }

        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (data) => {
                // Transform data to match the expected format
                const lead = {
                    time: data.Created || new Date().toISOString(),
                    name: data.Name || '',
                    email: data.Email || '',
                    phone: data.Phone || '',
                    secondaryPhone: data['Secondary Phone Number'] || '',
                    stage: data.Stage || 'New',
                    type: data.Source || '',
                    channel: data.Channel || '',
                    owner: data.Owner || '',
                    labels: data.Labels || '',
                    details: data.Details || ''
                };
                results.push(lead);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

module.exports = {
    router
};
