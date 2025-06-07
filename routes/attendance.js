// routes/attendance.js
const express = require('express');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { auth, authorize, checkApproval } = require('../middleware/auth');

const router = express.Router();

// Create attendance record
router.post('/', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const { userId, date, subjects } = req.body;

        // Check if user exists and is approved
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.isApproved) {
            return res.status(400).json({ message: 'User is not approved' });
        }

        // Check if attendance already exists for this date
        const existingAttendance = await Attendance.findOne({
            userId,
            date: new Date(date).toDateString()
        });

        if (existingAttendance) {
            return res.status(400).json({ message: 'Attendance already exists for this date' });
        }

        const attendance = new Attendance({
            userId,
            date: new Date(date),
            subjects,
            createdBy: req.user._id
        });

        await attendance.save();

        // Send notification to user
        await new Notification({
            recipientId: userId,
            senderId: req.user._id,
            type: 'attendance_update',
            message: `Your attendance for ${new Date(date).toDateString()} has been updated`,
            data: { attendanceId: attendance._id }
        }).save();

        res.status(201).json(attendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get user's attendance records
router.get('/my-attendance', auth, checkApproval, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        
        const attendance = await Attendance.find({ userId: req.user._id })
            .populate('createdBy', 'name role')
            .sort({ date: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Attendance.countDocuments({ userId: req.user._id });

        res.json({
            attendance,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get attendance by user ID (for teachers and admins)
router.get('/user/:userId', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        
        const attendance = await Attendance.find({ userId: req.params.userId })
            .populate('userId', 'name email')
            .populate('createdBy', 'name role')
            .sort({ date: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Attendance.countDocuments({ userId: req.params.userId });

        res.json({
            attendance,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update attendance
router.put('/:id', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const { subjects } = req.body;
        
        const attendance = await Attendance.findByIdAndUpdate(
            req.params.id,
            { subjects },
            { new: true }
        ).populate('userId', 'name email');

        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        // Send notification to user
        await new Notification({
            recipientId: attendance.userId._id,
            senderId: req.user._id,
            type: 'attendance_update',
            message: `Your attendance for ${attendance.date.toDateString()} has been updated`,
            data: { attendanceId: attendance._id }
        }).save();

        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete attendance
router.delete('/:id', auth, authorize('teacher', 'superadmin'), async (req, res) => {
    try {
        const attendance = await Attendance.findByIdAndDelete(req.params.id);
        
        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        res.json({ message: 'Attendance record deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
