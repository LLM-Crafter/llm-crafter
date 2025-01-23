const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

const register = async (req, res) => {
    console.log(req.body)
  try {
    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = new User({ email, password, name });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      id: user._id,
      email: user.email,
      name: user.name
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.password) updates.password = req.body.password;

    const user = await User.findById(req.user._id);
    Object.assign(user, updates);
    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not update profile' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile
};
