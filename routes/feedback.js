// routes/feedback.js
const express = require('express');
const cloudinary = require('cloudinary').v2;
const Feedback = require('../models/Feedback');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth, authorize, checkApproval } = require('../middleware/auth');
require('dotenv').config();
const router = express.Router();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
    
});

// Create feedback
router.post('/', auth, checkApproval, async (req, res) => {
    try {
        const { attendanceId, subject, message } = req.body;
        let imageUrl = null;

        // Upload image if provided
        if (req.files && req.files.image) {
            const result = await cloudinary.uploader.upload(req.files.image.tempFilePath, {
                folder: 'feedback_images',
                resource_type: 'auto'
            });
            imageUrl = result.secure_url;
        }

        // Verify attendance exists
        const attendance = await Attendance.findById(attendanceId);
        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        const feedback = new Feedback({
            userId: req.user._id,
            attendanceId,
            subject,
            message,
            image: imageUrl,
            sentBy: req.user._id,
            sentByRole: req.user.role
        });

        await feedback.save();

        // Send notification to teachers and admins
        const adminsAndTeachers = await User.find({
            role: { $in: ['teacher', 'superadmin'] }
        });

        const notifications = adminsAndTeachers.map(admin => ({
            recipientId: admin._id,
            senderId: req.user._id,
            type: 'feedback_received',
            message: `${req.user.name} sent feedback for ${subject}`,
            data: { feedbackId: feedback._id }
        }));

        await Notification.insertMany(notifications);

        res.status(201).json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get feedback for user
router.get('/my-feedback', auth, checkApproval, async (req, res) => {
    try {
        const feedback = await Feedback.find({ userId: req.user._id })
            .populate('attendanceId')
            .populate('sentBy', 'name role')
            .populate('replies.sentBy', 'name role')
            .sort({ createdAt: -1 });

        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all feedback (for teachers and admins)
router.get('/', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const feedback = await Feedback.find()
            .populate('userId', 'name email')
            .populate('attendanceId')
            .populate('sentBy', 'name role')
            .populate('replies.sentBy', 'name role')
            .sort({ createdAt: -1 });

        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Reply to feedback
router.post('/:id/reply', auth, async (req, res) => {
    try {
        const { message } = req.body;
        let imageUrl = null;

        // Upload image if provided
        if (req.files && req.files.image) {
            const result = await cloudinary.uploader.upload(req.files.image.tempFilePath, {
                folder: 'feedback_images',
                resource_type: 'auto'
            });
            imageUrl = result.secure_url;
        }

        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: 'Feedback not found' });
        }

        // Check if user can reply (either the original sender or teacher/admin)
        const canReply = feedback.userId.toString() === req.user._id.toString() || 
                         ['teacher', 'superadmin'].includes(req.user.role);

        if (!canReply) {
            return res.status(403).json({ message: 'Not authorized to reply' });
        }

        const reply = {
            message,
            image: imageUrl,
            sentBy: req.user._id,
            sentByRole: req.user.role
        };

        feedback.replies.push(reply);
        await feedback.save();

        // Send notification to relevant parties
        const notificationRecipients = [];
        
        // If user replied, notify teachers and admins
        if (req.user.role === 'user') {
            const adminsAndTeachers = await User.find({
                role: { $in: ['teacher', 'superadmin'] }
            });
            notificationRecipients.push(...adminsAndTeachers);
        } else {
            // If teacher/admin replied, notify the user
            const user = await User.findById(feedback.userId);
            if (user) {
                notificationRecipients.push(user);
            }
        }

        const notifications = notificationRecipients.map(recipient => ({
            recipientId: recipient._id,
            senderId: req.user._id,
            type: 'feedback_reply',
            message: `${req.user.name} replied to feedback`,
            data: { feedbackId: feedback._id }
        }));

        await Notification.insertMany(notifications);

        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;