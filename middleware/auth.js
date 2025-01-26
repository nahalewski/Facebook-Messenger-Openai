const session = require('express-session');

const authMiddleware = (req, res, next) => {
    // Skip auth for login page
    if (req.path === '/leads/login') {
        return next();
    }

    // Check if user is authenticated
    if (req.session && req.session.isAuthenticated) {
        return next();
    }

    // If not authenticated, redirect to login
    res.redirect('/leads/login');
};

module.exports = authMiddleware;
