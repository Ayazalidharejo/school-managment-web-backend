// routes/users.js
const express = require('express');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all users (for teachers and admins)
router.get('/', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const users = await User.find({ role: 'user' })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Approve user
router.put('/:id/approve', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isApproved: true },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send notification to user
        await new Notification({
            recipientId: user._id,
            senderId: req.user._id,
            type: 'user_registration',
            message: `Your account has been approved by ${req.user.name}`,
            data: { approved: true }
        }).save();

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: ' Server error', error: error.message });
    }
});

// Delete user
router.delete('/:id', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: ' Server error', error: error.message });
    }
});

// Update user
router.put('/:id', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const { name, email, subjects } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { name, email, subjects },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: ' Server error', error: error.message });
    }
});

module.exports = router;