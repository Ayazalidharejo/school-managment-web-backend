const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role = 'user' } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            role,
            isApproved: role !== 'user' // Auto approve teachers and admins
        });

        await user.save();

        // Send notification to teachers and admins if user role is 'user'
        if (role === 'user') {
            const adminsAndTeachers = await User.find({
                role: { $in: ['teacher', 'superadmin'] }
            });

            const notifications = adminsAndTeachers.map(admin => ({
                recipientId: admin._id,
                senderId: user._id,
                type: 'user_registration',
                message: `New user ${name} has registered and needs approval`,
                data: { userId: user._id }
            }));

            await Notification.insertMany(notifications);
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Google OAuth
router.post('/google', async (req, res) => {
    try {
        const { token } = req.body;
        
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { sub: googleId, email, name } = payload;

        // Check if user exists
        let user = await User.findOne({ $or: [{ email }, { googleId }] });
        
        if (!user) {
            // Create new user
            user = new User({
                name,
                email,
                googleId,
                role: 'user',
                isApproved: false
            });
            await user.save();

            // Send notification to admins and teachers
            const adminsAndTeachers = await User.find({
                role: { $in: ['teacher', 'superadmin'] }
            });

            const notifications = adminsAndTeachers.map(admin => ({
                recipientId: admin._id,
                senderId: user._id,
                type: 'user_registration',
                message: `New user ${name} has registered via Google and needs approval`,
                data: { userId: user._id }
            }));

            await Notification.insertMany(notifications);
        }

        // Generate JWT token
        const jwtToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token: jwtToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isApproved: req.user.isApproved,
            subjects: req.user.subjects
        }
    });
});

module.exports = router;