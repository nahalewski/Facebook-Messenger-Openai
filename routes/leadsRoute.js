const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Initialize empty arrays for leads and activities
let leads = [];
let activities = [];
let tasks = [];
let tags = [];
let reminders = [];
let pipelines = [{
    id: 'main',
    name: 'Main Pipeline',
    stages: ['New', 'Qualified', 'Contacted', 'Negotiation', 'Closed Won', 'Closed Lost']
}];

// Setup multer for CSV uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        // Create uploads directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'leads-' + Date.now() + '.csv');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            return cb(new Error('Only CSV files are allowed'));
        }
        cb(null, true);
    }
});

// Helper functions
function calculateMetrics() {
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    return {
        totalLeads: leads.length,
        newLeads: leads.filter(l => l.stage === 'New').length,
        qualifiedLeads: leads.filter(l => l.stage === 'Qualified').length,
        closedWonLeads: leads.filter(l => l.stage === 'Closed Won').length,
        conversionRate: calculateConversionRate(),
        avgResponseTime: calculateAvgResponseTime(),
        leadsByStage: calculateLeadsByStage(),
        overdueTasks: tasks.filter(t => new Date(t.dueDate) < now && t.status !== 'Completed'),
        upcomingTasks: tasks.filter(t => {
            const dueDate = new Date(t.dueDate);
            return dueDate >= now && dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        }),
        recentActivities: activities
            .filter(a => new Date(a.time) >= oneWeekAgo)
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .slice(0, 20)
    };
}

function calculateConversionRate() {
    const closedWon = leads.filter(l => l.stage === 'Closed Won').length;
    const totalClosed = leads.filter(l => l.stage.startsWith('Closed')).length;
    return totalClosed ? Math.round((closedWon / totalClosed) * 100) : 0;
}

function calculateAvgResponseTime() {
    const responseActivities = activities.filter(a => a.type === 'Response');
    if (!responseActivities.length) return 0;

    const totalResponseTime = responseActivities.reduce((sum, activity) => {
        return sum + (activity.responseTime || 0);
    }, 0);

    return Math.round(totalResponseTime / responseActivities.length);
}

function calculateLeadsByStage() {
    return pipelines[0].stages.reduce((acc, stage) => {
        acc[stage] = leads.filter(l => l.stage === stage).length;
        return acc;
    }, {});
}

function logActivity(type, description, leadId = null, userId = null) {
    const activity = {
        id: Date.now().toString(),
        type,
        description,
        leadId,
        userId,
        time: new Date().toISOString()
    };
    activities.push(activity);
    return activity;
}

// Routes
router.get('/', async (req, res) => {
    try {
        const metrics = calculateMetrics();
        
        // Helper function for activity icons
        const getActivityIcon = (type) => {
            const iconMap = {
                'CSV Import': 'file-import',
                'Lead Created': 'user-plus',
                'Lead Updated': 'user-edit',
                'Follow-up Scheduled': 'calendar-plus',
                'Note Added': 'sticky-note',
                'Email Sent': 'envelope',
                'Call Made': 'phone',
                'Meeting Scheduled': 'calendar-check',
                'Deal Won': 'trophy',
                'Deal Lost': 'times-circle'
            };
            return iconMap[type] || 'circle';
        };

        res.render('leads', {
            title: "Brian's Leads",
            leads,
            tasks,
            activities: activities.slice(0, 20),
            metrics,
            pipelines,
            getActivityIcon,
            message: req.query.message
        });
    } catch (error) {
        console.error('Error rendering leads page:', error);
        res.status(500).send('Error loading leads page');
    }
});

router.post('/add', (req, res) => {
    try {
        const newLead = {
            id: Date.now().toString(),
            ...req.body,
            time: new Date().toISOString(),
            stage: req.body.stage || 'New',
            value: parseFloat(req.body.value) || 0,
            tags: [],
            nextFollowUp: null
        };

        leads.push(newLead);
        logActivity('Lead Created', `New lead created: ${newLead.name}`);
        
        res.redirect('/leads?message=Lead added successfully');
    } catch (error) {
        console.error('Error adding lead:', error);
        res.status(500).send('Error adding lead');
    }
});

router.put('/:id', (req, res) => {
    try {
        const leadId = req.params.id;
        const leadIndex = leads.findIndex(l => l.id === leadId);
        
        if (leadIndex === -1) {
            return res.status(404).send('Lead not found');
        }

        const oldStage = leads[leadIndex].stage;
        const updatedLead = { ...leads[leadIndex], ...req.body };
        leads[leadIndex] = updatedLead;

        if (oldStage !== updatedLead.stage) {
            logActivity('Stage Changed', 
                `Lead stage changed from ${oldStage} to ${updatedLead.stage}`,
                leadId
            );
        }

        res.json(updatedLead);
    } catch (error) {
        console.error('Error updating lead:', error);
        res.status(500).send('Error updating lead');
    }
});

// Task Management
router.post('/:id/tasks', (req, res) => {
    try {
        const task = {
            id: Date.now().toString(),
            leadId: req.params.id,
            ...req.body,
            status: 'Pending',
            createdAt: new Date().toISOString()
        };

        tasks.push(task);
        
        // Create reminder if dueDate is set
        if (req.body.dueDate) {
            const reminder = {
                id: Date.now().toString() + '_reminder',
                taskId: task.id,
                leadId: req.params.id,
                dueDate: req.body.dueDate,
                message: `Task due: ${task.title}`,
                status: 'Pending'
            };
            reminders.push(reminder);
        }

        logActivity('Task Created', 
            `New task created: ${task.title}`,
            req.params.id
        );

        res.redirect('/leads?message=Task added successfully');
    } catch (error) {
        console.error('Error adding task:', error);
        res.status(500).send('Error adding task');
    }
});

// Tag Management
router.post('/:id/tags', (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = leads.find(l => l.id === leadId);
        
        if (!lead) {
            return res.status(404).send('Lead not found');
        }

        const newTag = {
            id: Date.now().toString(),
            name: req.body.name,
            color: req.body.color || '#6c757d'
        };

        if (!lead.tags) lead.tags = [];
        lead.tags.push(newTag);
        tags.push(newTag);

        logActivity('Tag Added', 
            `Tag added to lead: ${newTag.name}`,
            leadId
        );

        res.json(newTag);
    } catch (error) {
        console.error('Error adding tag:', error);
        res.status(500).send('Error adding tag');
    }
});

// Follow-up Management
router.post('/:id/followup', (req, res) => {
    try {
        const leadId = req.params.id;
        const lead = leads.find(l => l.id === leadId);
        
        if (!lead) {
            return res.status(404).send('Lead not found');
        }

        lead.nextFollowUp = req.body.date;
        
        const reminder = {
            id: Date.now().toString() + '_followup',
            leadId,
            dueDate: req.body.date,
            message: `Follow up with ${lead.name}`,
            status: 'Pending'
        };
        reminders.push(reminder);

        logActivity('Follow-up Scheduled', 
            `Follow-up scheduled for ${new Date(req.body.date).toLocaleDateString()}`,
            leadId
        );

        res.json({ 
            success: true 
        });
    } catch (error) {
        console.error('Error scheduling follow-up:', error);
        res.status(500).send('Error scheduling follow-up');
    }
});

// CSV upload route
router.post('/upload', upload.single('csvFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const results = [];
        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
                // Parse the date from the Created field
                const createdDate = new Date(data.Created || new Date());
                
                // Parse labels into an array
                const tags = data.Labels ? data.Labels.split(',').map(tag => tag.trim()) : [];
                
                const lead = {
                    id: Date.now().toString() + results.length,
                    time: createdDate.toISOString(),
                    name: data.Name || 'Unknown',
                    email: data.Email || '',
                    phone: data.Phone || '',
                    secondaryPhone: data['Secondary Phone Number'] || '',
                    source: data.Source || '',
                    form: data.Form || '',
                    channel: data.Channel || '',
                    stage: data.Stage || 'New',
                    owner: data.Owner || 'Unassigned',
                    tags: tags,
                    value: 0,
                    nextFollowUp: null
                };
                results.push(lead);
            })
            .on('error', (error) => {
                console.error('Error parsing CSV:', error);
                fs.unlink(req.file.path, () => {});
                res.status(500).json({ error: 'Error parsing CSV file' });
            })
            .on('end', () => {
                // Add all new leads
                leads.push(...results);
                
                // Add activities for the imported leads
                results.forEach(lead => {
                    activities.push({
                        type: 'Lead Created',
                        description: `New lead created: ${lead.name}`,
                        time: lead.time,
                        leadId: lead.id
                    });
                });

                // Clean up the uploaded file
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file:', err);
                });

                // Send success response
                res.json({ 
                    success: true, 
                    message: 'Leads imported successfully',
                    count: results.length 
                });
            });
    } catch (error) {
        console.error('Error uploading CSV:', error);
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(500).json({ error: error.message || 'Error uploading CSV' });
    }
});

// Add note to a lead
router.post('/add-note', (req, res) => {
    try {
        const { leadId, note } = req.body;
        const lead = leads.find(l => l.id === leadId);
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Add note to activities
        const activity = logActivity('Note Added', note, leadId);
        
        res.json({ 
            success: true, 
            activity 
        });
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).json({ error: 'Error adding note' });
    }
});

// Schedule a follow-up
router.post('/schedule-followup', (req, res) => {
    try {
        const { leadId, dateTime, notes } = req.body;
        const lead = leads.find(l => l.id === leadId);
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Update lead with follow-up
        lead.nextFollowUp = dateTime;
        
        // Add to activities
        const activity = logActivity(
            'Follow-up Scheduled', 
            `Follow-up scheduled for ${new Date(dateTime).toLocaleString()}${notes ? ': ' + notes : ''}`,
            leadId
        );
        
        res.json({ 
            success: true, 
            activity 
        });
    } catch (error) {
        console.error('Error scheduling follow-up:', error);
        res.status(500).json({ error: 'Error scheduling follow-up' });
    }
});

// Update lead stage
router.post('/update-stage', (req, res) => {
    try {
        const { leadId, stage, notes } = req.body;
        const lead = leads.find(l => l.id === leadId);
        
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const oldStage = lead.stage;
        lead.stage = stage;
        
        // Add to activities
        const activity = logActivity(
            'Stage Updated',
            `Stage changed from ${oldStage} to ${stage}${notes ? ': ' + notes : ''}`,
            leadId
        );
        
        res.json({ 
            success: true, 
            activity 
        });
    } catch (error) {
        console.error('Error updating stage:', error);
        res.status(500).json({ error: 'Error updating stage' });
    }
});

module.exports = {
    router
};
