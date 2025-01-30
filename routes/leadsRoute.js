const express = require('express');
const router = express.Router();
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// In-memory storage for leads, notes, and tasks (replace with database in production)
let leads = [];
let notes = [];
let tasks = [];

// GET /leads - Display leads page with dashboard
router.get('/', async (req, res) => {
    try {
        if (leads.length === 0) {
            leads = await readLeadsFromCSV();
        }
        
        // Calculate dashboard metrics
        const metrics = {
            totalLeads: leads.length,
            newLeads: leads.filter(l => l.stage === 'New').length,
            qualifiedLeads: leads.filter(l => l.stage === 'Qualified').length,
            closedLeads: leads.filter(l => l.stage === 'Closed').length,
            conversionRate: calculateConversionRate(leads)
        };

        res.render('leads', { 
            title: "Brian's Leads",
            leads: leads,
            notes: notes,
            tasks: tasks,
            metrics: metrics,
            message: req.query.message
        });
    } catch (error) {
        console.error('Error reading leads:', error);
        res.render('leads', { 
            title: "Brian's Leads",
            leads: [],
            notes: [],
            tasks: [],
            metrics: {},
            message: 'Error reading leads data'
        });
    }
});

// POST /leads/add - Add new lead
router.post('/add', (req, res) => {
    const newLead = {
        id: Date.now().toString(),
        time: new Date().toISOString(),
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        secondaryPhone: req.body.secondaryPhone,
        stage: req.body.stage || 'New',
        type: req.body.type,
        channel: req.body.channel,
        owner: req.body.owner,
        labels: req.body.labels,
        details: req.body.details,
        priority: req.body.priority || 'Medium'
    };
    
    leads.push(newLead);
    res.json({ success: true, lead: newLead });
});

// PUT /leads/:id - Update lead
router.put('/:id', (req, res) => {
    const leadIndex = leads.findIndex(l => l.id === req.params.id);
    if (leadIndex === -1) {
        return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    leads[leadIndex] = { ...leads[leadIndex], ...req.body };
    res.json({ success: true, lead: leads[leadIndex] });
});

// DELETE /leads/:id - Delete lead
router.delete('/:id', (req, res) => {
    leads = leads.filter(l => l.id !== req.params.id);
    res.json({ success: true });
});

// POST /leads/:id/notes - Add note to lead
router.post('/:id/notes', (req, res) => {
    const note = {
        id: Date.now().toString(),
        leadId: req.params.id,
        content: req.body.content,
        createdAt: new Date().toISOString(),
        createdBy: req.body.user || 'System'
    };
    
    notes.push(note);
    res.json({ success: true, note });
});

// POST /leads/:id/tasks - Add task for lead
router.post('/:id/tasks', (req, res) => {
    const task = {
        id: Date.now().toString(),
        leadId: req.params.id,
        title: req.body.title,
        description: req.body.description,
        dueDate: req.body.dueDate,
        priority: req.body.priority || 'Medium',
        status: 'Open',
        createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    res.json({ success: true, task });
});

// PUT /leads/tasks/:id - Update task status
router.put('/tasks/:id', (req, res) => {
    const taskIndex = tasks.findIndex(t => t.id === req.params.id);
    if (taskIndex === -1) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }
    
    tasks[taskIndex] = { ...tasks[taskIndex], ...req.body };
    res.json({ success: true, task: tasks[taskIndex] });
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
        leads = await readLeadsFromCSV(); // Refresh leads array
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
                    id: data.id || Date.now().toString(),
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
                    details: data.Details || '',
                    priority: data.Priority || 'Medium'
                };
                results.push(lead);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// Helper function to calculate conversion rate
function calculateConversionRate(leads) {
    if (leads.length === 0) return 0;
    const closedLeads = leads.filter(l => l.stage === 'Closed').length;
    return ((closedLeads / leads.length) * 100).toFixed(1);
}

module.exports = {
    router
};
