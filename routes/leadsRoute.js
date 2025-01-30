const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
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

// In-memory storage
let leads = [];
let activities = [];
let tasks = [];
let tags = [];
let reminders = [];
let pipelines = [{
    id: 'main',
    name: 'Main Pipeline',
    stages: ['New Inquiry', 'Site Survey', 'Quote Provided', 'Contract Review', 'Installation Scheduled', 'Service Active', 'Closed Lost']
}];

// Pipeline stages
const STAGES = ['New Inquiry', 'Site Survey', 'Quote Provided', 'Contract Review', 'Installation Scheduled', 'Service Active', 'Closed Lost'];

// Service packages
const PACKAGES = {
    'Basic': {
        speed: '200/10 Mbps',
        price: 69.99,
        features: ['Static IP Available', 'Business Email']
    },
    'Advanced': {
        speed: '600/35 Mbps',
        price: 109.99,
        features: ['Static IP Included', 'Business Email', 'Enhanced Security']
    },
    'Premium': {
        speed: '1000/500 Mbps',
        price: 249.99,
        features: ['Multiple Static IPs', 'Business Email Suite', 'Advanced Security', '24/7 Priority Support']
    },
    'Enterprise': {
        speed: 'Custom',
        price: 'Custom',
        features: ['Dedicated Fiber', 'SLA Guarantee', 'Enterprise Support', 'Custom Network Solutions']
    }
};

// Load initial leads from CSV
async function loadInitialLeads() {
    const csvPath = path.join(__dirname, '..', 'leads-3.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.log('No initial leads file found');
        return [];
    }

    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (data) => {
                const lead = {
                    id: generateId(),
                    name: data.Name || '',
                    businessName: data.BusinessName || '',
                    email: data.Email || '',
                    phone: data.Phone || '',
                    address: data.Address || '',
                    currentProvider: data.CurrentProvider || '',
                    currentSpeed: data.CurrentSpeed || '',
                    desiredSpeed: data.DesiredSpeed || '',
                    monthlyBudget: parseFloat(data.MonthlyBudget) || 0,
                    employeeCount: parseInt(data.EmployeeCount) || 0,
                    stage: STAGES.includes(data.Stage) ? data.Stage : 'New Inquiry',
                    interestedServices: data.InterestedServices ? data.InterestedServices.split(',').map(s => s.trim()) : [],
                    specialRequirements: data.SpecialRequirements || '',
                    contractLength: data.ContractLength || '12 months',
                    proposedPackage: data.ProposedPackage || '',
                    siteType: data.SiteType || 'Single Location',
                    created: data.Created || new Date().toISOString(),
                    nextFollowUp: data.NextFollowUp || null,
                    notes: data.Notes || ''
                };
                results.push(lead);
            })
            .on('end', () => {
                resolve(results);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Initialize leads from CSV
(async () => {
    try {
        leads = await loadInitialLeads();
        console.log(`Loaded ${leads.length} leads from CSV`);
        
        // Ensure each lead has a valid stage
        leads = leads.map(lead => ({
            ...lead,
            stage: STAGES.includes(lead.stage) ? lead.stage : 'New Inquiry'
        }));
    } catch (error) {
        console.error('Error loading initial leads:', error);
    }
})();

// Helper function to generate unique IDs
function generateId() {
    return 'lead_' + Math.random().toString(36).substr(2, 9);
}

// Helper function to log activities
function logActivity(type, description, leadId) {
    const activity = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        description,
        leadId,
        timestamp: new Date().toISOString()
    };
    
    activities.push(activity);
    return activity;
}

// Helper function to parse CSV data
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(file.path)
            .pipe(csv())
            .on('data', (data) => {
                const lead = {
                    id: Date.now().toString() + results.length,
                    time: new Date().toISOString(),
                    name: data.Name || 'Unknown',
                    email: data.Email || '',
                    phone: data.Phone || '',
                    secondaryPhone: data['Secondary Phone Number'] || '',
                    source: data.Source || '',
                    form: data.Form || '',
                    channel: data.Channel || '',
                    stage: STAGES.includes(data.Stage) ? data.Stage : 'New Inquiry',
                    owner: data.Owner || 'Unassigned',
                    tags: data.Tags ? data.Tags.split(',').map(tag => tag.trim()) : [],
                    value: 0,
                    nextFollowUp: null
                };
                results.push(lead);
            })
            .on('end', () => {
                // Clean up the uploaded file
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file:', err);
                });
                resolve(results);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Helper functions
function calculateMetrics() {
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    return {
        totalLeads: leads.length,
        activeDeals: leads.filter(l => !['Service Active', 'Closed Lost'].includes(l.stage)).length,
        installationsScheduled: leads.filter(l => l.stage === 'Installation Scheduled').length,
        activeServices: leads.filter(l => l.stage === 'Service Active').length,
        averageDealSize: leads.filter(l => l.monthlyBudget > 0).reduce((acc, curr) => acc + curr.monthlyBudget, 0) / 
                       leads.filter(l => l.monthlyBudget > 0).length || 0,
        topPackage: Object.entries(leads.reduce((acc, curr) => {
            if (curr.proposedPackage) {
                acc[curr.proposedPackage] = (acc[curr.proposedPackage] || 0) + 1;
            }
            return acc;
        }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
    };
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
            title: 'Business Internet Sales Dashboard',
            leads,
            tasks,
            activities: activities,
            stages: STAGES,
            packages: PACKAGES,
            metrics,
            message: req.query.message
        });
    } catch (error) {
        console.error('Error rendering leads page:', error);
        res.status(500).send('Error loading leads page');
    }
});

router.post('/add', (req, res) => {
    try {
        const lead = {
            id: generateId(),
            ...req.body
        };
        
        leads.push(lead);
        
        // Log activity
        const activity = logActivity(
            'Lead Added',
            `New lead ${lead.name} added from ${lead.source}`,
            lead.id
        );
        
        res.json({ 
            success: true, 
            lead,
            activity 
        });
    } catch (error) {
        console.error('Error adding lead:', error);
        res.status(500).json({ error: 'Error adding lead' });
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
                    stage: STAGES.includes(data.Stage) ? data.Stage : 'New Inquiry',
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

// Import leads from CSV
router.post('/import', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const results = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => {
                    const lead = {
                        id: generateId(),
                        name: data.Name || '',
                        businessName: data.BusinessName || '',
                        email: data.Email || '',
                        phone: data.Phone || '',
                        address: data.Address || '',
                        currentProvider: data.CurrentProvider || '',
                        currentSpeed: data.CurrentSpeed || '',
                        desiredSpeed: data.DesiredSpeed || '',
                        monthlyBudget: parseFloat(data.MonthlyBudget) || 0,
                        employeeCount: parseInt(data.EmployeeCount) || 0,
                        stage: STAGES.includes(data.Stage) ? data.Stage : 'New Inquiry',
                        interestedServices: data.InterestedServices ? data.InterestedServices.split(',').map(s => s.trim()) : [],
                        specialRequirements: data.SpecialRequirements || '',
                        contractLength: data.ContractLength || '12 months',
                        proposedPackage: data.ProposedPackage || '',
                        siteType: data.SiteType || 'Single Location',
                        created: data.Created || new Date().toISOString(),
                        nextFollowUp: data.NextFollowUp || null,
                        notes: data.Notes || ''
                    };
                    results.push(lead);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Clean up uploaded file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting uploaded file:', err);
        });

        // Add imported leads
        leads.push(...results);
        
        // Log activity
        const activity = logActivity(
            'Leads Imported',
            `Imported ${results.length} business internet leads`,
            null
        );
        
        res.json({ 
            success: true, 
            count: results.length,
            activity 
        });
    } catch (error) {
        console.error('Error importing leads:', error);
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(500).json({ error: 'Error importing leads' });
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

// Chat endpoint for lead generation
router.post('/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;
        
        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }

        const response = await openai.chatCompletion(message, userId);
        
        res.json({ 
            success: true, 
            message: response,
            leadCaptured: leadContext.get(userId)?.interested || false
        });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Endpoint to mark lead as interested
router.post('/mark-interested', async (req, res) => {
    try {
        const { userId } = req.body;
        const context = leadContext.get(userId);
        
        if (context) {
            context.interested = true;
            leadContext.set(userId, context);
            
            // Log activity
            const activity = logActivity(
                'Lead Interested',
                `${context.businessName || 'Business'} showed interest in services`,
                context.businessName
            );
            
            res.json({ success: true, activity });
        } else {
            res.status(404).json({ error: 'Lead context not found' });
        }
    } catch (error) {
        console.error('Error marking lead as interested:', error);
        res.status(500).json({ error: 'Failed to mark lead as interested' });
    }
});

// Endpoint to schedule callback
router.post('/schedule-callback', async (req, res) => {
    try {
        const { userId, callbackTime } = req.body;
        const context = leadContext.get(userId);
        
        if (context) {
            context.bestCallTime = callbackTime;
            leadContext.set(userId, context);
            
            // Log activity
            const activity = logActivity(
                'Callback Scheduled',
                `Callback scheduled with ${context.businessName || 'Business'} for ${callbackTime}`,
                context.businessName
            );
            
            // Send notification to Brian
            await sendLeadNotification(context);
            
            res.json({ success: true, activity });
        } else {
            res.status(404).json({ error: 'Lead context not found' });
        }
    } catch (error) {
        console.error('Error scheduling callback:', error);
        res.status(500).json({ error: 'Failed to schedule callback' });
    }
});

// Endpoint to get conversation history
router.get('/conversation/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const history = conversationHistory.get(userId) || [];
        res.json({ success: true, history });
    } catch (error) {
        console.error('Error getting conversation history:', error);
        res.status(500).json({ error: 'Failed to get conversation history' });
    }
});

// Endpoint to clear conversation
router.post('/clear-conversation', (req, res) => {
    try {
        const { userId } = req.body;
        clearConversation(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing conversation:', error);
        res.status(500).json({ error: 'Failed to clear conversation' });
    }
});

// Chat page route
router.get('/chat', (req, res) => {
    try {
        res.render('chat', {
            title: 'Business Internet Solutions Chat'
        });
    } catch (error) {
        console.error('Error rendering chat page:', error);
        res.status(500).send('Error loading chat page');
    }
});

module.exports = {
    router
};
