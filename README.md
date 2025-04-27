<p align="center">
  <img src="static/images/logo.png" alt="EMA Logo" width="200"/>
</p>

# EMA - Enhanced Mail Assistant Chrome Extension
https://ema-6gwc.onrender.com/#

A powerful Chrome extension that enhances your Gmail experience with AI-powered features for better email management and productivity.

## Features

### 📊 Email Summaries
- Get concise summaries of your inbox
- Apply advanced filters:
  - Email category (Inbox, Promotions, Social)
  - Time period (week, month, year, all)
  - Read/unread status
- Categorize emails by importance, action items, and FYIs
- Quickly understand email content without opening each message

### 📅 Calendar Integration
- Automatically detect event details from emails
- Extract event requests even when they don't include dates
- Connect directly with Google Calendar
- Add and remove events with a single click
- Smart date and time parsing from natural language

### 🤖 AI Assistant
- Chat with an AI about your emails
- Ask questions about specific emails or your inbox
- Create calendar events through conversation
- Compose and send emails via chat commands
- Powered by Gemini AI for intelligent responses

### 🔍 Gmail Overlay
- Summarize selected emails directly within Gmail
- View AI-generated insights without leaving your inbox
- Interact with email content in context

### 🎤 Voice Features
- Speech-to-text functionality for hands-free operation
- Integrates with Cloud Text-to-Speech API
- Voice commands for common actions

## Installation

### Chrome Web Store (Coming Soon)
1. Download the extension from the Chrome Web Store or the EMA website
2. Click on "Add to Chrome" to install
3. Grant the necessary permissions when prompted
4. Sign in with your Google account to enable Gmail integration

### Developer Mode Installation
Since the extension is not yet published on the Chrome Web Store, you can install it in developer mode:

#### Option 1: From Downloaded ZIP
1. Download and extract the EMA-extension.zip file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" button
5. Select the extracted EMA-extension folder
6. The extension icon should appear in your browser toolbar

#### Option 2: From Repository
1. Clone the repository: `git clone https://github.com/Omaritani24/EMA`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" button
5. Select the EMA-extension folder from the cloned repository
6. The extension icon should appear in your browser toolbar

## Usage

1. Click on the EMA extension icon in your Chrome toolbar while using Gmail
2. The popup interface will show your email summaries and options
3. Use the different tabs to access various features:
   - Summary: View email digests with customizable filters
   - Calendar: Manage detected events
   - Assistant: Chat with the AI helper
   - Settings: Configure extension preferences

## Privacy & Security

- EMA uses OAuth2 for secure authentication
- Your data remains private and is processed securely
- The extension only requests permissions necessary for its functionality
- No email content is stored permanently on external servers

## Troubleshooting

If you encounter any issues:
1. Make sure you're signed into your Google account
2. Check that you've granted all necessary permissions
3. Try refreshing Gmail or restarting Chrome
4. Visit our support website for additional help

## Development

This extension is built using:
- JavaScript
- HTML
- CSS
- Google APIs (Gmail, Calendar, People)
- Generative language API (Gemini)
- Cloud Text-to-Speech API





# EMA Website

A modern, responsive website for the EMA (Enhanced Mail Assistant) Chrome extension - an AI-powered email productivity tool that transforms your Gmail experience.

## Overview

The EMA Website serves as the landing page and distribution platform for the EMA Chrome extension. It features a clean, modern design that showcases the extension's capabilities, provides user registration, and offers downloads.

## Key Features

- **User Registration & Authentication**: Secure sign-up and login functionality
- **Extension Download**: Direct download of the EMA Chrome extension
- **Responsive Design**: Optimized viewing experience across all devices 
- **Feature Showcase**: Interactive demonstrations of the extension's capabilities
- **FAQ Section**: Answers to common questions
- **Testimonials**: Feedback from satisfied users

## Technology Stack

- **Frontend**:
  - HTML5
  - CSS3 (with responsive design principles)
  - JavaScript (vanilla)
  
- **Backend**:
  - Flask (Python web framework)
  - SQLite database
  - Werkzeug for security features
  
- **Deployment**:
  - Docker containerization
  - Gunicorn WSGI server

## Project Structure

```
EMA/
├── app.py                       # Main Flask application
├── Dockerfile                   # Docker configuration for deployment
├── .dockerignore                # Files to exclude from Docker build
├── Procfile                     # For Heroku/cloud deployment
├── README.md                    # Main project documentation
├── requirements.txt             # Python dependencies
├── setup_db.py                  # Database initialization script
├── users.db                     # SQLite database file
│
├── static/                      # Static assets for the website
│   ├── css/
│   │   └── styles.css           # Main stylesheet
│   ├── js/
│   │   └── main.js              # Main JavaScript file
│   ├── images/
│   │   ├── logo.png             # EMA logo
│   │   ├── hero.jpg             # Hero section image
│   │   ├── features/            # Feature showcase images
│   │   └── testimonials/        # User testimonial photos
│   └── ema-extension.zip        # Packaged extension for download
│
├── templates/                   # HTML templates
│   ├── index.html               # Landing page
│   ├── login.html               # User login
│   ├── signup.html              # User registration
│   ├── home.html                # User dashboard
│   ├── base.html                # Base template with common elements
│   └── components/              # Reusable UI components
│       ├── header.html
│       ├── footer.html
│       └── faq.html
│
├── js/                          # Additional JavaScript modules
│   └── analytics.js             # Analytics tracking
│
└── EMA-extension/               # Chrome extension source code
    ├── manifest.json            # Extension configuration
    ├── popup.html               # Extension popup interface
    ├── popup.js                 # Popup functionality
    ├── background.js            # Background service worker
    ├── content.js               # Gmail page integration
    ├── styles.css               # Extension styles
    ├── utils.js                 # Utility functions
    ├── storage.js               # Storage management
    ├── handlers.js              # Event handlers
    ├── geminiApi.js             # Gemini AI integration
    ├── gmailApi.js              # Gmail API integration
    ├── calendar.js              # Calendar integration
    ├── contactsApi.js           # Contacts API integration
    ├── agent.js                 # AI agent functionality
    ├── auth.js                  # Authentication
    ├── logo.png                 # Extension icon
    ├── key.b64                  # Extension key
    ├── EMA.crx                  # Packaged extension
    └── README.md                # Extension documentation
```

## Installation & Setup

### Local Development

1. Clone the repository
   ```
   git clone https://github.com/yourusername/EMA-website.git
   cd EMA-website
   ```

2. Create a virtual environment (optional but recommended)
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies
   ```
   pip install -r requirements.txt
   ```

4. Initialize the database
   ```
   python setup_db.py
   ```

5. Run the development server
   ```
   python app.py
   ```

6. Access the website at http://localhost:5000

### Docker Deployment

1. Build the Docker image
   ```
   docker build -t ema-website .
   ```

2. Run the container
   ```
   docker run -p 5000:5000 ema-website
   ```

3. Access the website at http://localhost:5000


## Presentation Link
https://docs.google.com/presentation/d/1HZXfAWxSROVs2PBwNQFWCzvnIIvOJjtw6FhIEzsAnoI/edit?usp=sharing

## License

This project is available under the MIT License.
