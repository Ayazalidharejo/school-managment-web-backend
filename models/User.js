// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: function() {
            return !this.googleId;
        }
    },
    googleId: {
        type: String,
        sparse: true
    },
    role: {
        type: String,
        enum: ['user', 'teacher', 'superadmin'],
        default: 'user'
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    profileImage: {
        type: String,
        default: null
    },
    subjects: [{
        type: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);