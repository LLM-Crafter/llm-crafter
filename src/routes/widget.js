const express = require('express');
const path = require('path');
const router = express.Router();

// Serve the chat widget files
const widgetPath = path.join(__dirname, '../../packages/chat-widget/dist');

// Middleware to set CORS headers for widget files
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Content-Type', 'application/javascript; charset=utf-8');
  res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  next();
});

// Serve the main widget file (unminified)
router.get('/chat-widget.js', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.js'));
});

// Serve the UMD version
router.get('/chat-widget.umd.js', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.umd.js'));
});

// Serve the minified version (recommended for production)
router.get('/chat-widget.min.js', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.min.js'));
});

// Serve source maps
router.get('/chat-widget.js.map', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.js.map'));
});

router.get('/chat-widget.umd.js.map', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.umd.js.map'));
});

router.get('/chat-widget.min.js.map', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.min.js.map'));
});

// Serve the latest version (alias for minified)
router.get('/latest.js', (req, res) => {
  res.sendFile(path.join(widgetPath, 'chat-widget.min.js'));
});

module.exports = router;
